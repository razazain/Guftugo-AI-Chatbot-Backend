import { Schema, model, type InferSchemaType } from 'mongoose';

const providerHealthLogSchema = new Schema({
  provider: { type: String, enum: ['groq', 'gemini', 'openai'], required: true, index: true },
  event: { type: String, enum: ['attempt_succeeded', 'attempt_failed', 'fallback_triggered'], required: true },
  errorCode: { type: String },
  latencyMs: { type: Number, min: 0 },
  requestId: { type: String },
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false });

providerHealthLogSchema.index({ provider: 1, createdAt: -1 });
providerHealthLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

export type ProviderHealthLog = InferSchemaType<typeof providerHealthLogSchema>;
export const ProviderHealthLogModel = model('ProviderHealthLog', providerHealthLogSchema);
