import { NextResponse } from 'next/server';
import { getTransactions } from '@/lib/firestore';
import { getUserId } from '@/lib/server-auth';

export async function GET(request: Request) {
  try {
    const userId = await getUserId(request);
    const transactions = await getTransactions(userId);

    return new Response(JSON.stringify(transactions, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename=transactions.json',
      },
    });
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
