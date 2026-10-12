import { Schema, model, type InferSchemaType } from 'mongoose';

const refreshTokenSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tokenHash: { type: String, required: true, unique: true, select: false },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date, default: null, index: true },
  userAgent: { type: String, maxlength: 512 },
  ipAddress: { type: String, maxlength: 64 },
}, { timestamps: true, versionKey: false });

refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type RefreshToken = InferSchemaType<typeof refreshTokenSchema>;
export const RefreshTokenModel = model('RefreshToken', refreshTokenSchema);
