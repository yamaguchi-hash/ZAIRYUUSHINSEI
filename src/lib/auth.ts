import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET,
  trustHost: true,
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        try {
          const email = credentials?.email as string | undefined;
          const password = credentials?.password as string | undefined;

          if (!email || !password) return null;

          const [user] = await db
            .select()
            .from(users)
            .where(eq(users.email, email.toLowerCase().trim()))
            .limit(1);

          if (!user || !user.passwordHash || !user.isActive) return null;

          const isValid = await bcrypt.compare(password, user.passwordHash);
          if (!isValid) return null;

          return {
            id: user.id,
            email: user.email,
            name: user.name ?? email,
            role: user.role,
            tenantId: user.tenantId,
          };
        } catch (err) {
          console.error("[auth] authorize error:", err);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.role = (user as any).role;
        token.tenantId = (user as any).tenantId;
        token.name = user.name;
        token.email = user.email;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = (token.sub ?? token.id) as string;
      (session.user as any).role = token.role;
      (session.user as any).tenantId = token.tenantId;
      session.user.email = token.email as string;

      // Always fetch the latest user data from the database
      // This ensures that any updates to the user (like display name) are reflected
      try {
        const userId = token.sub as string;
        const [latestUser] = await db
          .select({ name: users.name })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);

        if (latestUser) {
          session.user.name = latestUser.name as string;
        } else {
          session.user.name = token.name as string;
        }
      } catch (err) {
        console.error("[auth] Failed to fetch latest user data:", err);
        // Fallback to token data if DB query fails
        session.user.name = token.name as string;
      }

      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
});
