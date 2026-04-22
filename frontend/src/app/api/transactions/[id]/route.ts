import { NextResponse } from 'next/server';
import { getTransactionById, updateTransaction } from '@/lib/firestore';
import { getUserId } from '@/lib/server-auth';

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUserId(request);
    const { id } = await context.params;
    const transaction = await getTransactionById(userId, id);

    if (!transaction) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }

    await updateTransaction(id, { deletedAt: new Date() });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete transaction error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getUserId(request);
    const { id } = await context.params;
    const body = await request.json();
    const transaction = await getTransactionById(userId, id);

    if (!transaction) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }

    const updated = await updateTransaction(id, {
      merchant: body.merchant ?? body.merchant_name,
      description: body.description,
      amount: body.amount ?? body.amount_cents,
      category: body.category ?? body.category_id,
      datetime: body.datetime,
      paymentMethod: body.paymentMethod ?? body.payment_method,
      deletedAt: body.deletedAt ?? body.deleted_at,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Update transaction error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
