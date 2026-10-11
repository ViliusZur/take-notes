import { DateTime } from "luxon";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetEnvCacheForTests } from "@/server/env";
import { features } from "@/server/features";
import { runPlanningCron } from "@/server/modules/cron/service";
import { setMailerForTests, type Email } from "@/server/modules/notifications/service";
import { putSchedule } from "@/server/modules/schedules/service";
import { createUser } from "./helpers";

const OPTIONAL_VARS = [
  "VOICE_PROVIDER",
  "ANTHROPIC_API_KEY",
  "RESEND_API_KEY",
  "VAPI_API_KEY",
  "VAPI_PHONE_NUMBER_ID",
  "VAPI_WEBHOOK_SECRET",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_VERIFY_SERVICE_SID",
] as const;

let saved: Record<string, string | undefined>;

function setEnv(values: Partial<Record<(typeof OPTIONAL_VARS)[number], string>>) {
  for (const name of OPTIONAL_VARS) delete process.env[name];
  Object.assign(process.env, values);
  resetEnvCacheForTests();
}

beforeEach(() => {
  saved = Object.fromEntries(OPTIONAL_VARS.map((name) => [name, process.env[name]]));
});

afterEach(() => {
  for (const name of OPTIONAL_VARS) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
  resetEnvCacheForTests();
  setMailerForTests(undefined);
});

const vapi = { VAPI_API_KEY: "k", VAPI_PHONE_NUMBER_ID: "p", VAPI_WEBHOOK_SECRET: "s" };
const twilio = { TWILIO_ACCOUNT_SID: "a", TWILIO_AUTH_TOKEN: "t", TWILIO_VERIFY_SERVICE_SID: "v" };

describe("optional features", () => {
  it("is a planner only when nothing is configured", () => {
    setEnv({});
    expect(features()).toMatchObject({ email: false, calls: false, voice: null, sms: null });
    expect(features().missing.email).toEqual(["RESEND_API_KEY"]);
    expect(features().missing.calls).toContain("VAPI_API_KEY");
    expect(features().missing.calls).toContain("TWILIO_VERIFY_SERVICE_SID");
    expect(features().missing.calls).toContain("ANTHROPIC_API_KEY");
  });

  it("turns email on with a Resend key", () => {
    setEnv({ RESEND_API_KEY: "re_x" });
    expect(features()).toMatchObject({ email: true, calls: false });
  });

  it("needs Vapi, Twilio, and Claude for real calls", () => {
    setEnv({ ...vapi, ANTHROPIC_API_KEY: "sk" });
    expect(features()).toMatchObject({ calls: false, voice: "vapi", sms: null });
    expect(features().missing.calls).toEqual(["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_VERIFY_SERVICE_SID"]);

    setEnv({ ...vapi, ...twilio, ANTHROPIC_API_KEY: "sk" });
    expect(features()).toMatchObject({ calls: true, voice: "vapi", sms: "twilio" });
  });

  it("simulates calls and SMS in demo mode, which still needs Claude", () => {
    setEnv({ VOICE_PROVIDER: "simulated" });
    expect(features()).toMatchObject({ calls: false, voice: "simulated", sms: "simulated" });
    expect(features().missing.calls).toEqual(["ANTHROPIC_API_KEY"]);

    setEnv({ VOICE_PROVIDER: "simulated", ANTHROPIC_API_KEY: "sk" });
    expect(features()).toMatchObject({ calls: true, voice: "simulated", sms: "simulated" });
  });

  it("refuses to enable a channel that is not set up", async () => {
    const owner = await createUser();
    setEnv({});
    const schedule = {
      enabled: true,
      channel: "email" as const,
      dayOfWeek: 7,
      localTime: "18:00",
      timezone: "Europe/Vilnius",
      emailFallback: true,
    };
    await expect(putSchedule(owner.id, schedule)).rejects.toMatchObject({ status: 501 });
    await expect(putSchedule(owner.id, { ...schedule, enabled: false })).resolves.toMatchObject({ enabled: false });
  });

  it("skips scheduled runs that can no longer reach the user", async () => {
    const owner = await createUser();
    const setupTime = DateTime.fromISO("2026-10-08T09:00:00Z");
    setEnv({ RESEND_API_KEY: "re_x" });
    await putSchedule(
      owner.id,
      { enabled: true, channel: "email", dayOfWeek: 7, localTime: "18:00", timezone: "Europe/Vilnius", emailFallback: true },
      setupTime,
    );

    const sent: Email[] = [];
    setMailerForTests({ send: async (email) => void sent.push(email) });
    setEnv({});
    const summary = await runPlanningCron(DateTime.fromISO("2026-10-11T15:01:00Z"));
    expect(summary).toMatchObject({ schedulesRun: 1, remindersSent: 0, callsStarted: 0 });
    expect(sent).toEqual([]);
  });
});

describe("environment parsing", () => {
  it("treats empty values as unset so defaults apply", async () => {
    const { env } = await import("@/server/env");
    process.env.VOICE_PROVIDER = "";
    process.env.CALL_MONTHLY_CAP = "";
    process.env.EXTRACTION_MODEL = "";
    resetEnvCacheForTests();
    try {
      expect(env().VOICE_PROVIDER).toBeUndefined();
      expect(env()).toMatchObject({ CALL_MONTHLY_CAP: 6, EXTRACTION_MODEL: "claude-opus-5-5" });
      expect(features().voice).toBeNull();
    } finally {
      delete process.env.CALL_MONTHLY_CAP;
      delete process.env.EXTRACTION_MODEL;
    }
  });
});

describe("trusted origins", () => {
  const VARS = ["BETTER_AUTH_URL", "VERCEL_URL", "VERCEL_PROJECT_PRODUCTION_URL", "VERCEL_ENV"] as const;

  afterEach(() => {
    for (const name of VARS) delete process.env[name];
    resetEnvCacheForTests();
  });

  it("trusts a custom domain with and without www, plus the Vercel URLs", async () => {
    const { trustedOrigins } = await import("@/server/env");
    process.env.BETTER_AUTH_URL = "https://weekly-notes.com";
    process.env.VERCEL_URL = "take-notes-abc123.vercel.app";
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "www.weekly-notes.com";
    resetEnvCacheForTests();
    expect(trustedOrigins().sort()).toEqual(
      [
        "https://weekly-notes.com",
        "https://www.weekly-notes.com",
        "https://take-notes-abc123.vercel.app",
      ].sort(),
    );
  });

  it("uses the production domain on Vercel when no URL is configured", async () => {
    const { appUrl, trustedOrigins } = await import("@/server/env");
    process.env.VERCEL_ENV = "production";
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "weekly-notes.com";
    resetEnvCacheForTests();
    expect(appUrl()).toBe("https://weekly-notes.com");
    expect(trustedOrigins()).toContain("https://www.weekly-notes.com");
  });
});
