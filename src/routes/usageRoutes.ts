import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { getProviders, getUsageSummary } from '../controllers/usageController';

const router = Router();
router.use(authenticate);
router.get('/summary', getUsageSummary);
router.get('/providers', getProviders);
export default router;
