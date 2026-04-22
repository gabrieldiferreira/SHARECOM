import { clearUserCollections } from '../src/lib/firestore';

async function clearMockData() {
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ Not allowed in production');
    process.exit(1);
  }

  const userId = process.env.FIREBASE_SEED_USER_ID;
  if (!userId) {
    console.error('❌ FIREBASE_SEED_USER_ID is required');
    process.exit(1);
  }

  console.log('🧹 Clearing mock data...');

  try {
    const result = await clearUserCollections(userId);

    console.log('✅ Cleared:');
    console.log(`   - Transactions: ${result.transactions ?? 0}`);
    console.log(`   - Alerts: ${result.alerts ?? 0}`);
    console.log(`   - Budgets: ${result.budgets ?? 0}`);
    console.log(`   - Goals: ${result.goals ?? 0}`);

    console.log('✅ All mock data cleared');
  } catch (error) {
    console.error('❌ Error clearing data:', error);
    process.exit(1);
  }
}

clearMockData();
