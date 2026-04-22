import { NextResponse } from 'next/server';
import { createTransaction, getTransactions } from '@/lib/firestore';
import { getUserId } from '@/lib/server-auth';

export async function GET(request: Request) {
  try {
    const userId = await getUserId(request);
    const transactions = await getTransactions(userId, {
      start: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
    });

    return NextResponse.json(transactions);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: error instanceof Error && error.message === 'Unauthorized' ? 401 : 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getUserId(request);
    const body = await request.json();
    const transaction = await createTransaction(userId, body);

    return NextResponse.json(transaction, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: error instanceof Error && error.message === 'Unauthorized' ? 401 : 500 },
    );
  }
}
