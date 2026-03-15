// Vercel serverless entry point.

import { handle } from '@hono/node-server/vercel';
import { createApp } from './app.js';

const { app } = await createApp();

export default handle(app);
