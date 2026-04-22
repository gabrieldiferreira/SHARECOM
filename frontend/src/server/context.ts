import { inferAsyncReturnType } from '@trpc/server';
import { getServerSession } from 'next-auth';

// Define context type
export async function createContext() {
  const session = await getServerSession();

  return {
    session,
    user: session?.user,
  };
}

export type Context = inferAsyncReturnType<typeof createContext>;
