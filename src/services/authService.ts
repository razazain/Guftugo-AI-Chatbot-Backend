import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { Types } from 'mongoose';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { UserModel } from '../models/User';
import { RefreshTokenModel } from '../models/RefreshToken';
import { AppError } from '../utils/AppError';
import { verifyGoogleFirebaseIdToken } from './firebaseAdmin';

export type LanguagePreference = 'auto' | 'english' | 'roman-urdu';

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function issueAccessToken(userId: string): string {
  return jwt.sign({ typ: 'access' }, env.JWT_ACCESS_SECRET, {
    subject: userId,
    expiresIn: env.ACCESS_TOKEN_TTL as SignOptions['expiresIn'],
    issuer: 'guftugo-api',
    audience: 'guftugo-client',
  });
}

function issueRefreshToken(userId: string): string {
  return jwt.sign({ typ: 'refresh', nonce: crypto.randomUUID() }, env.JWT_REFRESH_SECRET, {
    subject: userId,
    expiresIn: env.REFRESH_TOKEN_DAYS * 24 * 60 * 60,
    issuer: 'guftugo-api',
    audience: 'guftugo-client',
  });
}

async function persistRefreshToken(userId: string, token: string, metadata?: { userAgent?: string; ipAddress?: string }) {
  await RefreshTokenModel.create({
    userId: new Types.ObjectId(userId),
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000),
    userAgent: metadata?.userAgent,
    ipAddress: metadata?.ipAddress,
  });
}

export async function registerUser(input: { name: string; email: string; password: string; preferredLanguage?: LanguagePreference }, metadata?: { userAgent?: string; ipAddress?: string }) {
  const normalizedEmail = input.email.trim().toLowerCase();
  const existing = await UserModel.exists({ email: normalizedEmail });
  if (existing) throw new AppError(409, 'EMAIL_ALREADY_REGISTERED', 'An account with this email already exists.');

  const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_SALT_ROUNDS);
  const user = await UserModel.create({
    name: input.name.trim(),
    email: normalizedEmail,
    passwordHash,
    preferredLanguage: input.preferredLanguage ?? 'auto',
  });

  const accessToken = issueAccessToken(user.id);
  const refreshToken = issueRefreshToken(user.id);
  await persistRefreshToken(user.id, refreshToken, metadata);
  return { user: publicUser(user), accessToken, refreshToken };
}

export async function loginUser(input: { email: string; password: string }, metadata?: { userAgent?: string; ipAddress?: string }) {
  const user = await UserModel.findOne({ email: input.email.trim().toLowerCase() }).select('+passwordHash');
  const passwordValid = user?.passwordHash ? await bcrypt.compare(input.password, user.passwordHash) : false;
  if (!user || !passwordValid || !user.isActive) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
  }

  const accessToken = issueAccessToken(user.id);
  const refreshToken = issueRefreshToken(user.id);
  await persistRefreshToken(user.id, refreshToken, metadata);
  return { user: publicUser(user), accessToken, refreshToken };
}

/** Verify a Firebase-issued Google ID token, then issue Guftugo's own API session tokens. */
export async function loginWithGoogleFirebase(
  idToken: string,
  preferredLanguage: LanguagePreference = 'auto',
  metadata?: { userAgent?: string; ipAddress?: string },
) {
  const identity = await verifyGoogleFirebaseIdToken(idToken);
  const normalizedEmail = identity.email.trim().toLowerCase();
  let user = await UserModel.findOne({ firebaseUid: identity.uid });

  if (user) {
    if (user.email !== normalizedEmail) {
      const emailOwner = await UserModel.exists({ email: normalizedEmail, _id: { $ne: user._id } });
      if (emailOwner) {
        throw new AppError(409, 'GOOGLE_EMAIL_IN_USE', 'This Google email is already associated with another account. Please sign in with that account.');
      }
      user.email = normalizedEmail;
      await user.save();
    }
  } else {
    // Firebase guarantees this email was verified by Google. It is therefore safe to
    // attach the Google identity to an existing Guftugo account with the same email.
    user = await UserModel.findOne({ email: normalizedEmail }).select('+firebaseUid');
    if (user) {
      if (user.firebaseUid && user.firebaseUid !== identity.uid) {
        throw new AppError(409, 'GOOGLE_ACCOUNT_CONFLICT', 'This email is connected to a different Google account. Please use your original sign-in method.');
      }
      user.firebaseUid = identity.uid;
      await user.save();
    } else {
      try {
        const displayName = identity.name?.trim().slice(0, 80);
        const emailName = normalizedEmail.split('@')[0].slice(0, 80);
        const safeName = displayName && displayName.length >= 2
          ? displayName
          : emailName.length >= 2 ? emailName : 'Google User';
        user = await UserModel.create({
          name: safeName,
          email: normalizedEmail,
          firebaseUid: identity.uid,
          preferredLanguage,
        });
      } catch (error) {
        // A parallel first-time Google sign-in can race on the unique email/UID index.
        const maybeMongoError = error as { code?: number };
        if (maybeMongoError?.code !== 11000) throw error;
        user = await UserModel.findOne({ $or: [{ firebaseUid: identity.uid }, { email: normalizedEmail }] }).select('+firebaseUid');
        if (!user || (user.firebaseUid && user.firebaseUid !== identity.uid)) {
          throw new AppError(409, 'GOOGLE_ACCOUNT_CONFLICT', 'An account with this Google email already exists. Please sign in with your existing account.');
        }
        if (!user.firebaseUid) { user.firebaseUid = identity.uid; await user.save(); }
      }
    }
  }

  if (!user.isActive) throw new AppError(403, 'ACCOUNT_UNAVAILABLE', 'This account is not available.');
  const accessToken = issueAccessToken(user.id);
  const refreshToken = issueRefreshToken(user.id);
  await persistRefreshToken(user.id, refreshToken, metadata);
  return { user: publicUser(user), accessToken, refreshToken };
}

export async function rotateRefreshToken(token: string, metadata?: { userAgent?: string; ipAddress?: string }) {
  let payload: jwt.JwtPayload;
  try {
    const verified = jwt.verify(token, env.JWT_REFRESH_SECRET, { issuer: 'guftugo-api', audience: 'guftugo-client' });
    if (typeof verified === 'string' || verified.typ !== 'refresh' || typeof verified.sub !== 'string') throw new Error('Bad refresh token');
    payload = verified;
  } catch {
    throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Your refresh session is invalid or expired. Please sign in again.');
  }

  const tokenHash = hashToken(token);
  const record = await RefreshTokenModel.findOne({ tokenHash, userId: payload.sub, revokedAt: null, expiresAt: { $gt: new Date() } }).select('+tokenHash');
  if (!record) throw new AppError(401, 'REFRESH_TOKEN_REVOKED', 'Your refresh session is no longer valid. Please sign in again.');

  // Revoke atomically before issuing a new token to prevent replay of the old token.
  const revoked = await RefreshTokenModel.findOneAndUpdate(
    { _id: record._id, revokedAt: null },
    { $set: { revokedAt: new Date() } },
    { new: true },
  );
  if (!revoked) throw new AppError(401, 'REFRESH_TOKEN_REUSED', 'This refresh token has already been used. Please sign in again.');

  const user = await UserModel.findById(payload.sub);
  if (!user || !user.isActive) throw new AppError(401, 'ACCOUNT_UNAVAILABLE', 'This account is not available.');
  const accessToken = issueAccessToken(user.id);
  const refreshToken = issueRefreshToken(user.id);
  await persistRefreshToken(user.id, refreshToken, metadata);
  return { user: publicUser(user), accessToken, refreshToken };
}

export async function revokeRefreshToken(token: string): Promise<void> {
  await RefreshTokenModel.updateOne({ tokenHash: hashToken(token), revokedAt: null }, { $set: { revokedAt: new Date() } });
}

export async function updateUserLanguage(userId: string, preferredLanguage: LanguagePreference) {
  const user = await UserModel.findByIdAndUpdate(userId, { $set: { preferredLanguage } }, { new: true, runValidators: true });
  if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User was not found.');
  return publicUser(user);
}

type PublicUserSource = {
  /** Mongoose's virtual `id` can be optional in hydrated-document typings. */
  id?: string;
  _id?: unknown;
  name: string;
  email: string;
  preferredLanguage: string;
  createdAt?: Date;
  updatedAt?: Date;
};

export function publicUser(user: PublicUserSource) {
  const id = typeof user.id === 'string' ? user.id : String(user._id ?? '');
  return {
    id,
    name: user.name,
    email: user.email,
    preferredLanguage: user.preferredLanguage,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
