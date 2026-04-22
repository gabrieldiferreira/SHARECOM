import * as admin from 'firebase-admin';
import { initAdmin } from '@/lib/firebase-admin';

function getBearerToken(request: Request): string | null {
  const authHeader =
    request.headers.get('authorization') ?? request.headers.get('Authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  return authHeader.slice('Bearer '.length);
}

export async function getUserId(request: Request): Promise<string> {
  const token = getBearerToken(request);
  if (!token) {
    throw new Error('Unauthorized');
  }

  if (!initAdmin()) {
    throw new Error('Firebase Admin not configured');
  }

  const decodedToken = await admin.auth().verifyIdToken(token);
  return decodedToken.uid;
}

export async function getDecodedToken(request: Request) {
  const token = getBearerToken(request);
  if (!token) {
    throw new Error('Unauthorized');
  }

  if (!initAdmin()) {
    throw new Error('Firebase Admin not configured');
  }

  return admin.auth().verifyIdToken(token);
}
