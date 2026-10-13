import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';

export type VerifiedGoogleIdentity = {
  uid: string;
  email: string;
  name?: string;
};

function getFirebaseAdminAuth() {
  const projectId = env.FIREBASE_PROJECT_ID.trim();
  const clientEmail = env.FIREBASE_CLIENT_EMAIL.trim();
  const privateKey = env.FIREBASE_PRIVATE_KEY.trim().replace(/\\n/g, '\n');
  console.log('Firebase Admin credentials:', { projectId, clientEmail, privateKey: privateKey ? '***' : '(empty)' });
  if (!projectId || !clientEmail || !privateKey) {
    throw new AppError(503, 'GOOGLE_SIGN_IN_NOT_CONFIGURED', 'Google sign-in is not configured on the server yet. Please use email and password for now.');
  }

  const appName = 'guftugo-firebase-admin';
  const existingApp = getApps().find((app) => app.name === appName);
  const app = existingApp ?? initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
    projectId,
  }, appName);
  return getAuth(app);
}

export async function verifyGoogleFirebaseIdToken(idToken: string): Promise<VerifiedGoogleIdentity> {
  let decoded;
  try {
    decoded = await getFirebaseAdminAuth().verifyIdToken(idToken);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(401, 'INVALID_GOOGLE_TOKEN', 'Google sign-in could not be verified. Please try again.');
  }

  const firebaseClaims = decoded.firebase as { sign_in_provider?: string } | undefined;
  if (firebaseClaims?.sign_in_provider !== 'google.com') {
    throw new AppError(401, 'GOOGLE_SIGN_IN_REQUIRED', 'Please continue with a verified Google account.');
  }
  if (decoded.email_verified !== true || typeof decoded.email !== 'string' || !decoded.email.trim()) {
    throw new AppError(401, 'GOOGLE_EMAIL_NOT_VERIFIED', 'Your Google email must be verified before you can sign in.');
  }

  return {
    uid: decoded.uid,
    email: decoded.email,
    name: typeof decoded.name === 'string' ? decoded.name : undefined,
  };
}
