// AWS Lambda entry point — use behind API Gateway with {proxy+} route.

import { handle } from 'hono/aws-lambda';
import { createApp } from './app.js';

const { app } = await createApp();

export const handler = handle(app);
