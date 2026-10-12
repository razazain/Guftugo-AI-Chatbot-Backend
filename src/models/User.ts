import { Schema, model, type InferSchemaType } from 'mongoose';

const userSchema = new Schema({
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
  email: { type: String, required: true, trim: true, lowercase: true, unique: true, maxlength: 254, index: true },
  passwordHash: { type: String, required: true, select: false },
  preferredLanguage: { type: String, enum: ['auto', 'english', 'roman-urdu'], default: 'auto' },
  isActive: { type: Boolean, default: true, index: true },
}, { timestamps: true, versionKey: false });

userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    // Cast to a mutable map because the inferred schema type marks this field required.
    // JSON output must never expose the stored password hash.
    const safeResult = ret as Record<string, unknown>;
    delete safeResult.passwordHash;
    return safeResult;
  },
});

export type User = InferSchemaType<typeof userSchema>;
export const UserModel = model('User', userSchema);
