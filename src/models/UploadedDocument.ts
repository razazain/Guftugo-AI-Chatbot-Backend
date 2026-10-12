import { Schema, model, type InferSchemaType } from 'mongoose';

const uploadedDocumentSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 255 },
  extension: { type: String, enum: ['txt', 'md', 'csv', 'json', 'pdf'], required: true },
  mimeType: { type: String, required: true, maxlength: 100 },
  sizeBytes: { type: Number, required: true, min: 1 },
  textContent: { type: String, required: true, select: false, maxlength: 250000 },
  characterCount: { type: Number, required: true, min: 0 },
  sha256: { type: String, required: true, maxlength: 64 },
}, { timestamps: true, versionKey: false });

uploadedDocumentSchema.index({ userId: 1, createdAt: -1 });

export type UploadedDocument = InferSchemaType<typeof uploadedDocumentSchema>;
export const UploadedDocumentModel = model('UploadedDocument', uploadedDocumentSchema);
