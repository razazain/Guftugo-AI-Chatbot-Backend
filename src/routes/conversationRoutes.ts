import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { createConversation, deleteConversation, getConversationMessages, listConversations, renameConversation } from '../controllers/conversationController';

const router = Router();
router.use(authenticate);
router.post('/', createConversation);
router.get('/', listConversations);
router.get('/:id/messages', getConversationMessages);
router.patch('/:id', renameConversation);
router.delete('/:id', deleteConversation);
export default router;
