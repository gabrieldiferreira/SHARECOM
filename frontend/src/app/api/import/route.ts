import { NextResponse } from 'next/server';
import { importTransactions } from '@/lib/firestore';
import { getUserId } from '@/lib/server-auth';

export async function POST(request: Request) {
  try {
    const userId = await getUserId(request);

    const data = await request.json();
    if (!Array.isArray(data)) {
      return NextResponse.json({ error: 'Invalid data format' }, { status: 400 });
    }

    const transactionsToInsert = await importTransactions(userId, data);

    return NextResponse.json({ success: true, count: transactionsToInsert.length });
  } catch (error) {
    console.error('Import error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
