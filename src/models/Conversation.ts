import { Schema, model, type InferSchemaType } from 'mongoose';

const conversationSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 120, default: 'New chat' },
  language: { type: String, enum: ['auto', 'english', 'roman-urdu'], default: 'auto' },
  lastMessageAt: { type: Date, default: Date.now, index: true },
  messageCount: { type: Number, default: 0, min: 0 },
}, { timestamps: true, versionKey: false });

conversationSchema.index({ userId: 1, lastMessageAt: -1 });

export type Conversation = InferSchemaType<typeof conversationSchema>;
export const ConversationModel = model('Conversation', conversationSchema);
