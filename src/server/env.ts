import "server-only";
import { z } from "zod";

const optional = z
  .string()
  .optional()
  .transform((value) => (value ? value : undefined));

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: optional,
  BETTER_AUTH_SECRET: optional,
  BETTER_AUTH_URL: optional,
  NEXT_PUBLIC_APP_URL: optional,
  VERCEL: optional,
  VERCEL_ENV: optional,
  VERCEL_URL: optional,
  VERCEL_BRANCH_URL: optional,
  VERCEL_PROJECT_PRODUCTION_URL: optional,
  GOOGLE_CLIENT_ID: optional,
  GOOGLE_CLIENT_SECRET: optional,
  ANTHROPIC_API_KEY: optional,
  EXTRACTION_MODEL: z.string().default("claude-opus-5-5"),
  /** `simulated` fakes the phone call and SMS code so the call flow can be tried without Vapi or Twilio. */
  VOICE_PROVIDER: z.enum(["vapi", "simulated"]).optional(),
  VAPI_API_KEY: optional,
  VAPI_PHONE_NUMBER_ID: optional,
  VAPI_WEBHOOK_SECRET: optional,
  /** Live-call model. Vapi only accepts its own list of Anthropic models; newest available is used. */
  VOICE_MODEL: z.string().default("claude-sonnet-5"),
  TWILIO_ACCOUNT_SID: optional,
  TWILIO_AUTH_TOKEN: optional,
  TWILIO_VERIFY_SERVICE_SID: optional,
  RESEND_API_KEY: optional,
  EMAIL_FROM: z.string().default("Weekly Planner <onboarding@resend.dev>"),
  CRON_SECRET: optional,
  CALL_MONTHLY_CAP: z.coerce.number().int().positive().default(6),
  CALL_ALLOWED_COUNTRY_CODES: z.string().default("+1,+44,+370"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/** Parsed lazily so `next build` does not require runtime secrets. Restart the server after changing env files. */
export function env(): Env {
  // `KEY=` with nothing after it (as copied from .env.example) means "not set", so defaults apply.
  cached ??= envSchema.parse(Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== "")));
  return cached;
}

/** Tests change process.env between cases. */
export function resetEnvCacheForTests() {
  cached = undefined;
}

export function isProduction() {
  return env().NODE_ENV === "production";
}

export function databaseUrl() {
  const { DATABASE_URL, VERCEL } = env();
  if (DATABASE_URL) return DATABASE_URL;
  // Vercel's filesystem is read-only and short-lived, so the local file database can't work there.
  if (VERCEL) throw new Error("DATABASE_URL is required on Vercel. Add a Neon database to the project.");
  return "pglite://.pglite";
}

function vercelUrl() {
  const { VERCEL_ENV, VERCEL_PROJECT_PRODUCTION_URL, VERCEL_URL } = env();
  if (VERCEL_ENV === "production" && VERCEL_PROJECT_PRODUCTION_URL) return `https://${VERCEL_PROJECT_PRODUCTION_URL}`;
  if (VERCEL_URL) return `https://${VERCEL_URL}`;
  return undefined;
}

export function appUrl() {
  const { NEXT_PUBLIC_APP_URL, BETTER_AUTH_URL } = env();
  return NEXT_PUBLIC_APP_URL ?? BETTER_AUTH_URL ?? vercelUrl() ?? "http://localhost:3000";
}

/** A custom domain is usually reachable with and without "www."; trust both. */
function withWwwTwin(origin: string): string[] {
  const url = new URL(origin);
  if (url.hostname === "localhost" || url.hostname.endsWith(".vercel.app")) return [url.origin];
  const twin = url.hostname.startsWith("www.") ? url.hostname.slice(4) : `www.${url.hostname}`;
  return [url.origin, `${url.protocol}//${twin}${url.port ? `:${url.port}` : ""}`];
}

/** Origins allowed to call the auth API: the app URL (and its www twin) plus this Vercel deployment's URLs. */
export function trustedOrigins() {
  const { VERCEL_URL, VERCEL_BRANCH_URL, VERCEL_PROJECT_PRODUCTION_URL } = env();
  const hosts = [VERCEL_URL, VERCEL_BRANCH_URL, VERCEL_PROJECT_PRODUCTION_URL].filter(Boolean);
  const origins = [appUrl(), ...hosts.map((host) => `https://${host}`)];
  return [...new Set(origins.flatMap(withWwwTwin))];
}

export function allowedCountryCodes() {
  return env()
    .CALL_ALLOWED_COUNTRY_CODES.split(",")
    .map((code) => code.trim())
    .filter(Boolean);
}
