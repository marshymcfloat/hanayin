import { Role } from "@/prisma/generated/prisma/enums";
import { prisma } from "@/prisma/prisma";
import { normalizePhilippinePhone } from "@/lib/services/sms-otp";
import { consumeOnboardingLoginToken } from "@/lib/security/onboarding-login-token";
import bcrypt from "bcryptjs";
import type { NextAuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { isSessionUserValid } from "@/lib/auth/session-validity";

export const authOptions: NextAuthOptions = {
  providers: [
    Credentials({
      credentials: {
        contact_number: { label: "contact_number", type: "tel" },
        password: { label: "password", type: "password" },
      },
      async authorize(credentials) {
        const invalidCredentialsError = new Error("Invalid credentials");

        if (!credentials?.contact_number || !credentials.password)
          throw invalidCredentialsError;

        const contactNumber = credentials.contact_number.trim();
        const normalized = normalizePhilippinePhone(contactNumber);

        const user = await prisma.user.findFirst({
          where: {
            OR: [
              { contact_number: normalized },
              ...(contactNumber === normalized
                ? []
                : [{ contact_number: contactNumber }]),
            ],
          },
          include: {
            employee: {
              include: {
                business: true,
              },
            },
            owner: {
              include: {
                business: true,
              },
            },
          },
        });

        if (!user) throw invalidCredentialsError;

        const isPasswordValid = await bcrypt.compare(
          credentials.password,
          user.hashed_password,
        );

        if (!isPasswordValid) throw invalidCredentialsError;

        // Distinct error code so the sign-in form can surface a clear
        // "your temporary password expired -- ask your manager to
        // resend the invite" message instead of the same generic
        // "Invalid credentials" the user sees for a wrong password.
        // Owners hit this when an employee's 3-day temp window lapses
        // before the employee logged in.
        if (
          user.must_change_password &&
          user.temp_password_expires_at &&
          new Date() > user.temp_password_expires_at
        ) {
          throw new Error("TEMP_PASSWORD_EXPIRED");
        }

        return user;
      },
    }),
    // Magic-link login for newly-converted onboarding applications.
    // The platform admin's "convert" flow mints an
    // OnboardingLoginToken and sends it via SMS / email; the
    // applicant clicks the link, lands on /login/magic, and that
    // route signs them in via this provider. No password handoff.
    Credentials({
      id: "onboarding-magic-link",
      name: "Magic link",
      credentials: {
        token: { label: "Token", type: "text" },
      },
      async authorize(credentials) {
        const invalidLink = new Error("Invalid or expired login link");
        if (!credentials?.token) throw invalidLink;
        // Atomically consume the jti — first call wins, replays return null.
        const payload = await consumeOnboardingLoginToken(credentials.token);
        if (!payload) throw invalidLink;

        const user = await prisma.user.findUnique({
          where: { id: payload.userId },
          include: {
            employee: { include: { business: true } },
            owner: { include: { business: true } },
          },
        });
        if (!user) throw invalidLink;

        // The token confirms the onboarding application matches this
        // user — extra defense-in-depth check that the application is
        // actually CONVERTED before allowing the magic-link login.
        const application = await prisma.onboardingApplication.findUnique({
          where: { id: payload.applicationId },
          select: { status: true, converted_business_id: true },
        });
        if (!application || application.status !== "CONVERTED") {
          throw invalidLink;
        }

        return user;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const u = user as any;
        token.contactNumber = u.contact_number;
        token.name = u.name;
        token.id = u.id;
        token.role = u.role;
        token.businessSlug =
          u.role === Role.PLATFORM_ADMIN
            ? null
            : (u.employee?.business.slug ?? u.owner?.business.slug);
        token.isPlatformAdmin = u.role === Role.PLATFORM_ADMIN;
        token.mustChangePassword = u.must_change_password;
        token.tempPasswordExpiresAt =
          u.temp_password_expires_at?.toISOString() ?? null;
      }

      if (trigger === "update" && session?.user) {
        if (typeof session.user.mustChangePassword === "boolean") {
          token.mustChangePassword = session.user.mustChangePassword;
        }
        if ("tempPasswordExpiresAt" in session.user) {
          token.tempPasswordExpiresAt =
            session.user.tempPasswordExpiresAt ?? null;
        }
      }
      return token;
    },
    async session({ session, token }) {
      // NextAuth rejects the session and clears its cookies on the session endpoint.
      if (!(await isSessionUserValid(token))) {
        throw new Error("Session account or workspace no longer exists");
      }
      if (token) {
        session.user.contactNumber = token.contactNumber as string;
        session.user.name = token.name;
        session.user.id = token.id;
        session.user.role = token.role as Role;
        session.user.businessSlug = token.businessSlug;
        session.user.isPlatformAdmin = !!token.isPlatformAdmin;
        session.user.mustChangePassword = !!token.mustChangePassword;
        session.user.tempPasswordExpiresAt =
          typeof token.tempPasswordExpiresAt === "string"
            ? token.tempPasswordExpiresAt
            : null;
      }
      return session;
    },
  },
};
