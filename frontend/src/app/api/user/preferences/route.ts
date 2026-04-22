import { NextResponse } from 'next/server';
import { upsertUser } from '@/lib/firestore';
import { getDecodedToken } from '@/lib/server-auth';

export async function PATCH(request: Request) {
  try {
    const decodedToken = await getDecodedToken(request);

    const { locale, currency } = await request.json();

    const dataToUpdate: Record<string, string> = {};
    if (locale) dataToUpdate.locale = locale;
    if (currency) dataToUpdate.currency = currency;

    if (Object.keys(dataToUpdate).length > 0) {
      await upsertUser(decodedToken.uid, {
        email: decodedToken.email ?? '',
        name: decodedToken.name ?? null,
        photoURL: decodedToken.picture ?? null,
        ...dataToUpdate,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Preferences update error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
