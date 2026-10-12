import type { RequestHandler } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/AppError';
import { deleteUserDocument, getUserDocument, listUserDocuments, storeUploadedDocument } from '../services/documentService';
import { paginationQuerySchema } from '../utils/pagination';
import { requireRouteParam } from '../utils/routeParam';

export const uploadDocument: RequestHandler = asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError(400, 'FILE_REQUIRED', 'Attach a file using the multipart form field named "file".');
  const document = await storeUploadedDocument(req.user!.id, req.file);
  res.status(201).json({ success: true, data: { document } });
});

export const listDocuments: RequestHandler = asyncHandler(async (req, res) => {
  const { page, limit } = paginationQuerySchema.parse(req.query);
  const data = await listUserDocuments(req.user!.id, page, limit);
  res.json({ success: true, data });
});

export const getDocument: RequestHandler = asyncHandler(async (req, res) => {
  const query = z.object({ includeContent: z.enum(['true', 'false']).default('false') }).parse(req.query);
  const documentId = requireRouteParam(req.params.id, 'document id');
  const document = await getUserDocument(req.user!.id, documentId, query.includeContent === 'true');
  res.json({ success: true, data: { document } });
});

export const deleteDocument: RequestHandler = asyncHandler(async (req, res) => {
  const documentId = requireRouteParam(req.params.id, 'document id');
  await deleteUserDocument(req.user!.id, documentId);
  res.json({ success: true, data: { message: 'Document deleted successfully.' } });
});
