// Standalone Node.js entry point — for local dev and self-hosted deployments.

import { serve } from '@hono/node-server';
import { createApp } from './app.js';

const { app, config } = await createApp();

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`AgentGuard telemetry server listening on http://localhost:${info.port}`);
  console.log(`Storage backend: ${config.storageBackend}`);
  if (config.allowedIps.length > 0) {
    console.log(`IP whitelist: ${config.allowedIps.join(', ')}`);
  } else {
    console.log('IP whitelist: disabled (all IPs allowed)');
  }
  if (config.isDev && !config.apiKey) {
    console.log('API key auth: disabled (development mode)');
  }
});
