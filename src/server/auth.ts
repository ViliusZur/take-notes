import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db, schema } from "@/server/db";
import { appUrl, env, isProduction, trustedOrigins } from "@/server/env";

function socialProviders() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = env();
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) return {};
  return { google: { clientId: GOOGLE_CLIENT_ID, clientSecret: GOOGLE_CLIENT_SECRET } };
}

function secret() {
  const value = env().BETTER_AUTH_SECRET;
  if (value) return value;
  if (isProduction()) throw new Error("BETTER_AUTH_SECRET is required in production");
  return "dev-only-secret-change-me-dev-only-secret";
}

function createAuth() {
  return betterAuth({
    appName: "Weekly Planner",
    baseURL: appUrl(),
    trustedOrigins: trustedOrigins(),
    secret: secret(),
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    emailAndPassword: { enabled: true, minPasswordLength: 10 },
    socialProviders: socialProviders(),
    user: {
      additionalFields: {
        timezone: { type: "string", required: false, defaultValue: "UTC", input: true },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },
    plugins: [nextCookies()],
  });
}

type Auth = ReturnType<typeof createAuth>;

const globalForAuth = globalThis as unknown as { __weeklyAuth?: Auth };

/** Created lazily so `next build` never needs runtime secrets. */
export function auth(): Auth {
  globalForAuth.__weeklyAuth ??= createAuth();
  return globalForAuth.__weeklyAuth;
}

export function googleEnabled() {
  return "google" in socialProviders();
}
