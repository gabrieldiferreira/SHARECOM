import NextAuth from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';

const handler = NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || 'mock',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'mock',
    }),
  ],
  callbacks: {
    async session({ session, user, token }) {
      if (session.user) {
        // @ts-expect-error - NextAuth types don't include id on user
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
