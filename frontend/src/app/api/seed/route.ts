import { NextRequest, NextResponse } from 'next/server';
import { clearUserCollections, seedFirestore, upsertUser } from '@/lib/firestore';
import { getUserId } from '@/lib/server-auth';

export async function POST(req: NextRequest) {
  try {
    const userId = await getUserId(req);
    await upsertUser(userId, {
      email: '',
      locale: 'pt-BR',
      currency: 'BRL',
    });
    await clearUserCollections(userId);
    const result = await seedFirestore(userId, 300);

    return NextResponse.json({
      success: true,
      message: 'Seed completed successfully',
      userId,
      transactionsCreated: result.transactionsCreated,
    });
  } catch (error) {
    console.error('Seed error:', error);
    return NextResponse.json(
      { error: 'Failed to seed data', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
