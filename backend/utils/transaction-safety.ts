import { Prisma, PrismaClient } from '@prisma/client';

export class OptimisticLockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OptimisticLockError';
  }
}

export class IdempotencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IdempotencyError';
  }
}

export interface TransactionOperation {
  accountId: string;
  amountCents: number;
  type: 'credit' | 'debit';
  idempotencyKey?: string;
}

export async function safeUpdateBalance(
  prisma: PrismaClient,
  operation: TransactionOperation
) {
  const { accountId, amountCents, type, idempotencyKey } = operation;

  if (idempotencyKey) {
    const existing = await prisma.transaction.findUnique({
      where: { idempotency_key: idempotencyKey },
    });
    if (existing) {
      throw new IdempotencyError(
        `Transaction with idempotency key ${idempotencyKey} already exists`
      );
    }
  }

  return await prisma.$transaction(async (tx) => {
    const account = await tx.account.findUnique({
      where: { id: accountId },
      select: { balance_cents: true, version: true },
    });

    if (!account) {
      throw new Error(`Account ${accountId} not found`);
    }

    const expectedVersion = account.version;
    const newBalance =
      type === 'credit'
        ? account.balance_cents + amountCents
        : account.balance_cents - amountCents;

    if (newBalance < 0) {
      throw new Error('Insufficient funds');
    }

    await tx.account.update({
      where: {
        id: accountId,
        version: expectedVersion,
      },
      data: {
        balance_cents: newBalance,
        version: { increment: 1 },
      },
    });

    const transaction = await tx.transaction.create({
      data: {
        user_id: (await tx.account.findUnique({ where: { id: accountId } }))!.user_id,
        account_id: accountId,
        amount_cents: amountCents,
        type: type === 'credit' ? 'income' : 'expense',
        idempotency_key: idempotencyKey,
        version: 0,
        datetime: new Date(),
      },
    });

    return transaction;
  });
}

export async function safeTransfer(
  prisma: PrismaClient,
  fromAccountId: string,
  toAccountId: string,
  amountCents: number,
  idempotencyKey?: string
) {
  if (idempotencyKey) {
    const existing = await prisma.transaction.findUnique({
      where: { idempotency_key: idempotencyKey },
    });
    if (existing) {
      throw new IdempotencyError(
        `Transaction with idempotency key ${idempotencyKey} already exists`
      );
    }
  }

  return await prisma.$transaction(async (tx) => {
    const [fromAccount, toAccount] = await Promise.all([
      tx.account.findUnique({
        where: { id: fromAccountId },
        select: { balance_cents: true, version: true, user_id: true },
      }),
      tx.account.findUnique({
        where: { id: toAccountId },
        select: { balance_cents: true, version: true, user_id: true },
      }),
    ]);

    if (!fromAccount || !toAccount) {
      throw new Error('One or both accounts not found');
    }

    if (fromAccount.balance_cents < amountCents) {
      throw new Error('Insufficient funds');
    }

    await tx.account.update({
      where: { id: fromAccountId, version: fromAccount.version },
      data: {
        balance_cents: { decrement: amountCents },
        version: { increment: 1 },
      },
    });

    await tx.account.update({
      where: { id: toAccountId, version: toAccount.version },
      data: {
        balance_cents: { increment: amountCents },
        version: { increment: 1 },
      },
    });

    return { fromAccountId, toAccountId, amountCents };
  });
}