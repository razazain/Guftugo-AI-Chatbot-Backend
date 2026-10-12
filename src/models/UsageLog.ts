import { Schema, model, type InferSchemaType } from 'mongoose';

const usageLogSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation' },
  messageId: { type: Schema.Types.ObjectId, ref: 'Message' },
  provider: { type: String, enum: ['groq', 'gemini', 'openai'], required: true },
  model: { type: String, required: true },
  promptTokens: { type: Number, min: 0, default: 0 },
  completionTokens: { type: Number, min: 0, default: 0 },
  totalTokens: { type: Number, min: 0, default: 0 },
  estimatedTokens: { type: Boolean, default: false },
  latencyMs: { type: Number, min: 0, default: 0 },
  status: { type: String, enum: ['success', 'error'], required: true },
  errorCode: { type: String },
  fallbackUsed: { type: Boolean, default: false },
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false });

usageLogSchema.index({ userId: 1, createdAt: -1 });
usageLogSchema.index({ provider: 1, createdAt: -1 });

export type UsageLog = InferSchemaType<typeof usageLogSchema>;
export const UsageLogModel = model('UsageLog', usageLogSchema);
