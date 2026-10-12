import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import { authenticate } from '../middleware/authenticate';
import { deleteDocument, getDocument, listDocuments, uploadDocument } from '../controllers/documentController';
import { MAX_UPLOAD_BYTES } from '../services/documentService';
import { AppError } from '../utils/AppError';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  fileFilter(_req, file, callback) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!['.txt', '.md', '.csv', '.json', '.pdf'].includes(ext)) {
      callback(new AppError(415, 'UNSUPPORTED_FILE_TYPE', 'Supported file types are .txt, .md, .csv, .json, and text-based .pdf files.'));
      return;
    }
    callback(null, true);
  },
});

const router = Router();
router.use(authenticate);
router.post('/', upload.single('file'), uploadDocument);
router.get('/', listDocuments);
router.get('/:id', getDocument);
router.delete('/:id', deleteDocument);
export default router;
