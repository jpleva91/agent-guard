// Session viewer routes — upload and serve self-contained HTML session reports.
//
// POST /api/v1/sessions/:id/viewer — Upload HTML viewer for a session
// GET  /v/sessions/:id              — Serve the HTML viewer (public, no auth)
// GET  /api/v1/sessions             — List uploaded session viewers

import { Hono } from 'hono';
import type { SessionViewerStore } from '../store/types.js';

const MAX_HTML_SIZE = 5 * 1024 * 1024; // 5 MB

export function sessionViewerRoutes(store: SessionViewerStore): Hono {
  const routes = new Hono();

  // Upload a session viewer HTML — requires auth (handled by middleware in app.ts)
  routes.post('/v1/sessions/:id/viewer', async (c) => {
    const sessionId = c.req.param('id');
    if (!sessionId || sessionId.length > 200) {
      return c.json({ error: 'Invalid session ID' }, 400);
    }

    const contentType = c.req.header('content-type') || '';
    let html: string;

    if (contentType.includes('application/json')) {
      const body = (await c.req.json()) as { html?: string };
      if (!body.html || typeof body.html !== 'string') {
        return c.json({ error: 'Missing "html" field in JSON body' }, 400);
      }
      html = body.html;
    } else {
      html = await c.req.text();
    }

    if (html.length > MAX_HTML_SIZE) {
      return c.json({ error: `HTML exceeds max size of ${MAX_HTML_SIZE} bytes` }, 413);
    }

    if (!html.includes('<!DOCTYPE html') && !html.includes('<html')) {
      return c.json({ error: 'Body does not appear to be valid HTML' }, 400);
    }

    await store.uploadSessionViewer(sessionId, html);

    const viewerUrl = `/v/sessions/${encodeURIComponent(sessionId)}`;
    return c.json({ ok: true, session_id: sessionId, viewer_url: viewerUrl }, 201);
  });

  // List uploaded session viewers
  routes.get('/v1/sessions', async (c) => {
    const sessions = await store.listSessionViewers({
      limit: c.req.query('limit') ? Number(c.req.query('limit')) : undefined,
      offset: c.req.query('offset') ? Number(c.req.query('offset')) : undefined,
    });
    return c.json(sessions);
  });

  return routes;
}

/** Public route — serves the HTML viewer directly (no auth). */
export function sessionViewerPublicRoutes(store: SessionViewerStore): Hono {
  const routes = new Hono();

  routes.get('/v/sessions/:id', async (c) => {
    const sessionId = c.req.param('id');
    const record = await store.getSessionViewer(sessionId);

    if (!record) {
      return c.html(
        '<html><body style="background:#0F172A;color:#F8FAFC;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">' +
          '<div style="text-align:center"><h1>Session not found</h1><p>This session viewer may have expired or does not exist.</p></div>' +
          '</body></html>',
        404
      );
    }

    return c.html(record.html);
  });

  return routes;
}
