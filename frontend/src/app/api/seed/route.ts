import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateMockTransactions } from '@/lib/mock-data';
import { v4 as uuidv4 } from 'uuid';
import { getServerSession } from 'next-auth';
// Assuming you have next-auth setup. If not, we might seed for a generic user.
// Since SHARECOM is using Firebase Auth mostly, we should find the active user or create a generic one.

export async function POST(req: Request) {
  // Only allow in development or if explicitly enabled
  if (process.env.NODE_ENV !== 'development' && process.env.NEXT_PUBLIC_ALLOW_SEED !== 'true') {
    return NextResponse.json({ error: 'Seed endpoint disabled in production' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const action = body.action || 'seed';
    const count = body.count || 300;
    
    // 1. Get or create a default user for seeding
    let user = await prisma.user.findUnique({ where: { email: 'dev@sharecom.io' } });
    if (!user) {
      user = await prisma.user.create({
        data: { email: 'dev@sharecom.io', name: 'Dev User' }
      });
    }

    const userId = user.id;

    if (action === 'clear') {
      await prisma.transaction.deleteMany({ where: { user_id: userId } });
      await prisma.alert.deleteMany({ where: { user_id: userId } });
      await prisma.goal.deleteMany({ where: { user_id: userId } });
      await prisma.budget.deleteMany({ where: { user_id: userId } });
      await prisma.account.deleteMany({ where: { user_id: userId } });
      return NextResponse.json({ success: true, message: 'All mock data cleared.' });
    }

    if (action === 'fast-forward') {
      // Shift all transaction dates forward by 30 days
      await prisma.$executeRaw`UPDATE "transactions" SET "datetime" = "datetime" + interval '30 days' WHERE "user_id" = ${userId}`;
      return NextResponse.json({ success: true, message: 'Fast-forwarded data by 30 days.' });
    }

    if (action === 'anomaly') {
      // Create a high value anomaly transaction right now
      const account = await prisma.account.findFirst({ where: { user_id: userId } });
      if (!account) return NextResponse.json({ error: 'No account found to add anomaly' }, { status: 400 });

      await prisma.transaction.create({
        data: {
          id: uuidv4(),
          user_id: userId,
          account_id: account.id,
          amount_cents: 850000,
          type: 'expense',
          category_id: 'others',
          merchant_name: 'Apple Store SP',
          datetime: new Date(),
          payment_method: 'card',
          authentication_code: 'FRAUD_TRIGGER_1',
        }
      });
      await prisma.alert.create({
        data: {
          id: uuidv4(),
          user_id: userId,
          type: 'unusual_amount',
          severity: 'critical',
          message: 'Transação suspeita detectada agora na Apple Store SP: R$ 8.500,00',
        }
      });
      return NextResponse.json({ success: true, message: 'Anomaly transaction and alert injected.' });
    }

    // Default action: SEED
    
    // 2. Clear existing test data for this user
    await prisma.transaction.deleteMany({ where: { user_id: userId } });
    await prisma.alert.deleteMany({ where: { user_id: userId } });
    await prisma.goal.deleteMany({ where: { user_id: userId } });
    await prisma.budget.deleteMany({ where: { user_id: userId } });
    await prisma.account.deleteMany({ where: { user_id: userId } });
    // Keep base categories, just make sure they exist

    // 3. Create Categories
    const baseCategories = [
      { id: 'eatingOut', name: 'Alimentação Fora' },
      { id: 'groceries', name: 'Mercado' },
      { id: 'transport', name: 'Transporte' },
      { id: 'services', name: 'Assinaturas' },
      { id: 'health', name: 'Saúde' },
      { id: 'home', name: 'Casa' },
      { id: 'leisure', name: 'Lazer' },
      { id: 'income', name: 'Receita' },
      { id: 'others', name: 'Outros' }
    ];

    for (const cat of baseCategories) {
      await prisma.category.upsert({
        where: { id: cat.id },
        update: {},
        create: { id: cat.id, name: cat.name }
      });
    }

    // 4. Create 3 Mock Accounts
    const account1 = await prisma.account.create({
      data: { id: uuidv4(), user_id: userId, institution: 'Itaú', balance_cents: 524010, type: 'checking' }
    });
    const account2 = await prisma.account.create({
      data: { id: uuidv4(), user_id: userId, institution: 'Nubank', balance_cents: 322000, type: 'savings' }
    });
    const account3 = await prisma.account.create({
      data: { id: uuidv4(), user_id: userId, institution: 'Inter', balance_cents: 402022, type: 'credit' }
    });

    // 5. Generate and Insert Transactions
    const txs = generateMockTransactions(userId, account1.id, count);
    
    // Batch insert transactions
    await prisma.transaction.createMany({
      data: txs
    });

    // 6. Generate Budgets
    await prisma.budget.createMany({
      data: [
        { id: uuidv4(), user_id: userId, category_id: 'eatingOut', month: new Date().toISOString().substring(0,7), limit_amount_cents: 80000 },
        { id: uuidv4(), user_id: userId, category_id: 'groceries', month: new Date().toISOString().substring(0,7), limit_amount_cents: 120000 },
        { id: uuidv4(), user_id: userId, category_id: 'transport', month: new Date().toISOString().substring(0,7), limit_amount_cents: 40000 },
      ]
    });

    // 7. Generate Goals
    await prisma.goal.createMany({
      data: [
        { id: uuidv4(), user_id: userId, name: 'Fundo de Emergência', target_amount_cents: 300000, current_amount_cents: 125000, deadline: new Date(Date.now() + 180 * 86400000) },
        { id: uuidv4(), user_id: userId, name: 'Férias', target_amount_cents: 150000, current_amount_cents: 62000 },
      ]
    });

    // 8. Generate Alerts
    await prisma.alert.createMany({
      data: [
        { id: uuidv4(), user_id: userId, type: 'fraud_suspect', severity: 'critical', message: 'Detectamos 2 transações idênticas em um curto período.' },
        { id: uuidv4(), user_id: userId, type: 'unusual_amount', severity: 'warning', message: 'Uma transação de R$ 1.500,00 na Uber está fora do seu padrão.' },
        { id: uuidv4(), user_id: userId, type: 'first_time_recipient', severity: 'info', message: 'Primeira vez transferindo para Apple Store SP.' },
        { id: uuidv4(), user_id: userId, type: 'balance_threshold', severity: 'warning', message: 'Atenção, você ultrapassou 80% do orçamento de Mercado.' },
      ]
    });

    return NextResponse.json({ 
      success: true, 
      message: `Database seeded with ${count} transactions, 3 accounts, budgets, goals, and alerts for dev user.`,
      user_id: userId 
    });
  } catch (error) {
    console.error('Seed error:', error);
    return NextResponse.json({ error: 'Failed to process seed action' }, { status: 500 });
  }
}
