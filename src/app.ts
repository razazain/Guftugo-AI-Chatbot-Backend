import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import mongoose from 'mongoose';
import { env } from './config/env';
import { logger } from './config/logger';
import { globalLimiter } from './middleware/rateLimits';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import authRoutes from './routes/authRoutes';
import chatRoutes from './routes/chatRoutes';
import conversationRoutes from './routes/conversationRoutes';
import usageRoutes from './routes/usageRoutes';
import documentRoutes from './routes/documentRoutes';

export const app = express();
app.disable('x-powered-by');
app.set('trust proxy', env.NODE_ENV === 'production' ? 1 : false);
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || env.CORS_ORIGINS.includes(origin)) return callback(null, true);
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
  maxAge: 86400,
}));
app.use(express.json({ limit: env.MAX_JSON_BODY_SIZE }));
app.use(express.urlencoded({ extended: false, limit: env.MAX_JSON_BODY_SIZE }));
app.use(pinoHttp({ logger, quietReqLogger: true, redact: ['req.headers.authorization', 'req.headers.cookie'] }));
app.use(globalLimiter);

const api = express.Router();
api.get('/health', (_req, res) => {
  res.json({ success: true, data: { service: 'guftugo-backend', status: 'ok', database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected', timestamp: new Date().toISOString() } });
});
api.get('/health/ready', (_req, res) => {
  const ready = mongoose.connection.readyState === 1;
  res.status(ready ? 200 : 503).json({ success: ready, data: { ready, database: ready ? 'connected' : 'disconnected' } });
});
api.use('/auth', authRoutes);
api.use('/chat', chatRoutes);
api.use('/conversations', conversationRoutes);
api.use('/documents', documentRoutes);
api.use('/usage', usageRoutes);

app.get('/', (_req, res) => {
  res.json({ name: 'Guftugo API', version: '1.0.0', health: `${env.API_PREFIX}/health`, note: 'See README.md and docs/API.md in the project ZIP for API documentation.' });
});
app.use(env.API_PREFIX, api);
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
