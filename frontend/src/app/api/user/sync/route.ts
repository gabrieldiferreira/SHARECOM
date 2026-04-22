import { NextResponse } from 'next/server';
import { getUserProfile, upsertUser } from '@/lib/firestore';
import { getDecodedToken } from '@/lib/server-auth';

export async function POST(request: Request) {
  try {
    const decodedToken = await getDecodedToken(request);
    const existingUser = await getUserProfile(decodedToken.uid);
    const user = await upsertUser(decodedToken.uid, {
      email: decodedToken.email ?? '',
      name: decodedToken.name ?? null,
      photoURL: decodedToken.picture ?? null,
      locale: typeof existingUser?.locale === 'string' ? existingUser.locale : 'pt-BR',
      currency: typeof existingUser?.currency === 'string' ? existingUser.currency : 'BRL',
    });

    return NextResponse.json({
      success: true,
      user: {
        locale: user.locale,
        currency: user.currency,
      },
    });
  } catch (error) {
    console.error('User sync error:', error);
    // Return success with defaults to avoid blocking the app
    return NextResponse.json({
      success: true,
      user: { locale: 'pt-BR', currency: 'BRL' },
      warning: 'Using default settings'
    }, { status: 200 });
  }
}
