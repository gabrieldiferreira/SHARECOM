import { NextResponse } from 'next/server';
import { getTransactions } from '@/lib/firestore';
import { getUserId } from '@/lib/server-auth';

export async function GET(request: Request) {
  try {
    const userId = await getUserId(request);

    const { searchParams } = new URL(request.url);
    const timeframe = searchParams.get('timeframe') || 'monthly';
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');

    let startDate: Date | undefined;
    let endDate: Date | undefined;
    const now = new Date();

    if (startDateParam && endDateParam) {
      startDate = new Date(startDateParam);
      endDate = new Date(endDateParam);
    } else {
      switch (timeframe) {
        case 'quarterly':
          const threeMonthsAgo = new Date(now);
          threeMonthsAgo.setMonth(now.getMonth() - 3);
          startDate = threeMonthsAgo;
          break;
        case 'annual':
          const oneYearAgo = new Date(now);
          oneYearAgo.setFullYear(now.getFullYear() - 1);
          startDate = oneYearAgo;
          break;
        case 'monthly':
        default:
          const oneMonthAgo = new Date(now);
          oneMonthAgo.setMonth(now.getMonth() - 1);
          startDate = oneMonthAgo;
          break;
      }
    }

    const transactions = await getTransactions(userId, { start: startDate, end: endDate });

    const aggregated = {
      totalInflow: 0,
      totalOutflow: 0,
      byCategory: {} as Record<string, { inflow: number; outflow: number; count: number }>,
      byMonth: {} as Record<string, { inflow: number; outflow: number; count: number }>,
      transactions: transactions.map(tx => ({
        id: tx.id,
        amount: Number(tx.amount ?? 0),
        type: tx.type,
        category: tx.category || 'Outros',
        merchant: tx.merchant,
        datetime: tx.datetime,
        payment_method: tx.paymentMethod,
      })),
    };

    transactions.forEach(tx => {
      const amount = Number(tx.amount ?? 0);
      if (tx.type === 'income') {
        aggregated.totalInflow += amount;
      } else {
        aggregated.totalOutflow += amount;
      }

      const category = String(tx.category ?? 'Outros');
      if (!aggregated.byCategory[category]) {
        aggregated.byCategory[category] = { inflow: 0, outflow: 0, count: 0 };
      }
      aggregated.byCategory[category].count++;
      if (tx.type === 'income') {
        aggregated.byCategory[category].inflow += amount;
      } else {
        aggregated.byCategory[category].outflow += amount;
      }

      const month = new Date(String(tx.datetime)).toISOString().slice(0, 7);
      if (!aggregated.byMonth[month]) {
        aggregated.byMonth[month] = { inflow: 0, outflow: 0, count: 0 };
      }
      aggregated.byMonth[month].count++;
      if (tx.type === 'income') {
        aggregated.byMonth[month].inflow += amount;
      } else {
        aggregated.byMonth[month].outflow += amount;
      }
    });

    return NextResponse.json(aggregated);
  } catch (error) {
    console.error('Reports error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
