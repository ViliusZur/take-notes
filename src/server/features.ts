import "server-only";
import { env } from "@/server/env";
import { HttpError } from "@/server/http";
import type { FeaturesDto } from "@/lib/api-types";

/**
 * Optional features switch on when their environment variables are present.
 * Nothing here is required: without any of them the app is a planner only.
 */
export type Features = {
  email: boolean;
  calls: boolean;
  voice: "vapi" | "simulated" | null;
  sms: "twilio" | "simulated" | null;
  /** Env vars still needed per feature, for the setup hints in Settings. */
  missing: { email: string[]; calls: string[] };
};

function missingVars(names: (keyof ReturnType<typeof env>)[]) {
  const values = env();
  return names.filter((name) => !values[name]);
}

export function features(): Features {
  const values = env();
  const emailMissing = missingVars(["RESEND_API_KEY"]);

  const simulated = values.VOICE_PROVIDER === "simulated";
  const vapiMissing = missingVars(["VAPI_API_KEY", "VAPI_PHONE_NUMBER_ID", "VAPI_WEBHOOK_SECRET"]);
  const twilioMissing = missingVars(["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_VERIFY_SERVICE_SID"]);
  const claudeMissing = missingVars(["ANTHROPIC_API_KEY"]);

  const voice = simulated ? "simulated" : vapiMissing.length === 0 ? "vapi" : null;
  const sms = twilioMissing.length === 0 ? "twilio" : simulated ? "simulated" : null;
  const callsMissing = simulated ? claudeMissing : [...vapiMissing, ...twilioMissing, ...claudeMissing];

  return {
    email: emailMissing.length === 0,
    calls: voice !== null && sms !== null && claudeMissing.length === 0,
    voice,
    sms,
    missing: { email: emailMissing, calls: callsMissing },
  };
}

export function featuresDto(): FeaturesDto {
  const current = features();
  return {
    email: current.email,
    calls: current.calls,
    simulatedCalls: current.calls && current.voice === "simulated",
    simulatedSms: current.sms === "simulated",
    missing: current.missing,
  };
}

export function requireFeature(feature: "email" | "calls") {
  if (!features()[feature]) {
    const label = feature === "email" ? "Email reminders are" : "Planning calls are";
    throw new HttpError(501, `${label} not set up on this server`);
  }
}
