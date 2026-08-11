import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import type { Provider } from "next-auth/providers";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { sendRegistrationEmails } from "@/lib/registration-mail";
import type { NavStyle, Role, UserStatus } from "@prisma/client";

declare module "next-auth" {
  interface User {
    role?: Role;
    status?: UserStatus;
    suspended?: boolean;
    navStyle?: NavStyle;
  }
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      role: Role;
      status: UserStatus;
      suspended: boolean;
      navStyle: NavStyle;
    };
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id?: string;
    role?: Role;
    status?: UserStatus;
    suspended?: boolean;
    navStyle?: NavStyle;
  }
}

const providers: Provider[] = [
  Credentials({
    name: "credentials",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      const email = String(credentials?.email || "").toLowerCase().trim();
      // Trimmed everywhere a password is set or checked — some mobile
      // keyboards/password managers append a trailing space on autofill,
      // which would otherwise fail bcrypt.compare on some devices but not
      // others for the exact same password.
      const password = String(credentials?.password || "").trim();
      if (!email || !password) return null;

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user?.passwordHash) return null;

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) return null;

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status,
        suspended: user.suspended,
        navStyle: user.navStyle,
      };
    },
  }),
];

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      // A user who registered with email+password and later signs in with
      // Google (same address) should land on the same account, not a
      // rejected "account already exists" error.
      allowDangerousEmailAccountLinking: true,
    }),
  );
}

const useSecureCookies = process.env.APP_URL?.startsWith("https://") ?? false;

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  trustHost: true,
  useSecureCookies,
  pages: { signIn: "/login" },
  providers,
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider !== "google" || !user.email) return true;

      const email = user.email.toLowerCase();
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        user.id = existing.id;
        return true;
      }

      // First-time Google sign-in: provision a PENDING member the same way
      // the registration form would, including the default group/person
      // type and the admin notification email.
      const [defaultGroup, defaultPersonType] = await Promise.all([
        prisma.group.findFirst({ where: { isDefault: true } }),
        prisma.personType.findFirst({ where: { isDefault: true }, orderBy: { createdAt: "asc" } }),
      ]);

      const created = await prisma.user.create({
        data: {
          email,
          name: user.name,
          image: user.image,
          status: "PENDING",
          role: "MEMBER",
          personTypeId: defaultPersonType?.id,
          emailVerified: new Date(),
        },
      });
      if (defaultGroup) {
        await prisma.userGroup.create({ data: { userId: created.id, groupId: defaultGroup.id } });
      }
      user.id = created.id;

      try {
        await sendRegistrationEmails({ email: created.email, name: created.name });
      } catch (err) {
        console.error("[mail] registration emails failed:", err);
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user?.id) token.id = user.id;
      if (token.id) {
        // Re-read on every request so role/status/suspended changes made by
        // an admin take effect without forcing the member to log out.
        const dbUser = await prisma.user.findUnique({ where: { id: token.id } });
        if (dbUser) {
          token.role = dbUser.role;
          token.status = dbUser.status;
          token.suspended = dbUser.suspended;
          token.email = dbUser.email;
          token.name = dbUser.name;
          token.navStyle = dbUser.navStyle;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id;
        session.user.role = token.role ?? "MEMBER";
        session.user.status = token.status ?? "PENDING";
        session.user.suspended = Boolean(token.suspended);
        session.user.navStyle = token.navStyle ?? "BUTTONS";
      }
      return session;
    },
  },
});
