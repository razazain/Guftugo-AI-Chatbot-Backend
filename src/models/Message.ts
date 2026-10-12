import { Schema, model, type InferSchemaType } from 'mongoose';

const messageSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
  role: { type: String, enum: ['user', 'assistant'], required: true },
  // Pending/failed assistant messages can legitimately have an empty body while the
  // model is generating (or when generation fails before any output). User messages
  // and completed assistant messages must contain actual content.
  content: {
    type: String,
    required: function (this: any) {
      return this.role === 'user' || this.status === 'complete';
    },
    maxlength: 150000,
    default: '',
  },
  status: { type: String, enum: ['pending', 'complete', 'failed'], default: 'complete', index: true },
  provider: { type: String, enum: ['groq', 'gemini', 'openai'] },
  model: { type: String },
  tokenUsage: {
    promptTokens: { type: Number, min: 0, default: 0 },
    completionTokens: { type: Number, min: 0, default: 0 },
    totalTokens: { type: Number, min: 0, default: 0 },
    estimated: { type: Boolean, default: false },
  },
  latencyMs: { type: Number, min: 0 },
  fallbackUsed: { type: Boolean, default: false },
  errorCode: { type: String },
  documentIds: [{ type: Schema.Types.ObjectId, ref: 'UploadedDocument' }],
  sources: [{
    title: { type: String, maxlength: 500 },
    url: { type: String, maxlength: 2048 },
    snippet: { type: String, maxlength: 4000 },
  }],
}, { timestamps: true, versionKey: false });

messageSchema.index({ conversationId: 1, _id: -1 });
messageSchema.index({ userId: 1, createdAt: -1 });

export type Message = InferSchemaType<typeof messageSchema>;
export const MessageModel = model('Message', messageSchema);
