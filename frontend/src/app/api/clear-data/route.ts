import { NextRequest, NextResponse } from 'next/server';
import { clearUserCollections } from '@/lib/firestore';
import { getUserId } from '@/lib/server-auth';

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'Not allowed in production' },
      { status: 403 }
    );
  }

  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const userId = await getUserId(request);
    const deletedCounts = await clearUserCollections(userId);

    return NextResponse.json({
      success: true,
      message: 'All test data cleared',
      counts: {
        transactions: deletedCounts.transactions ?? 0,
        alerts: deletedCounts.alerts ?? 0,
        budgets: deletedCounts.budgets ?? 0,
        goals: deletedCounts.goals ?? 0,
      },
    });
  } catch (error) {
    console.error('[Clear Data] Error:', error);
    return NextResponse.json(
      { error: 'Failed to clear data' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Use POST to clear all test data',
    warning: 'This endpoint is disabled in production',
  });
}
