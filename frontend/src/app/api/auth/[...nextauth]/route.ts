import NextAuth from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
// import { PrismaAdapter } from '@next-auth/prisma-adapter';
// import { prisma } from '../../../../src/lib/prisma';

const handler = NextAuth({
  // adapter: PrismaAdapter(prisma), // uncomment when DB is deployed
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || 'mock',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'mock',
    }),
  ],
  callbacks: {
    async session({ session, user, token }) {
      if (session.user) {
        // @ts-ignore
        session.user.id = user?.id || token?.sub;
      }
      return session;
    },
  },
  session: {
    strategy: 'jwt',
  },
});

export { handler as GET, handler as POST };
