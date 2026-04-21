import { inferAsyncReturnType } from '@trpc/server';
import { prisma } from '../lib/prisma';
import { getServerSession } from 'next-auth';

// Define context type
export async function createContext() {
  const session = await getServerSession();

  return {
    prisma,
    session,
    user: session?.user,
  };
}

export type Context = inferAsyncReturnType<typeof createContext>;
