import { Router } from 'express';
import { authLimiter } from '../middleware/rateLimits';
import { authenticate } from '../middleware/authenticate';
import { getMe, googleSignIn, login, logout, refresh, register, setLanguage, updateMe } from '../controllers/authController';

const router = Router();
router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.post('/google', authLimiter, googleSignIn);
router.post('/refresh', authLimiter, refresh);
router.post('/logout', authenticate, logout);
router.get('/me', authenticate, getMe);
router.patch('/me', authenticate, updateMe);
router.patch('/me/language', authenticate, setLanguage);
export default router;
