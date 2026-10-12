import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { chatLimiter } from '../middleware/rateLimits';
import { sendMessage, streamMessage } from '../controllers/chatController';

const router = Router();
router.use(authenticate);
router.post('/', chatLimiter, sendMessage);
router.post('/stream', chatLimiter, streamMessage);
export default router;
