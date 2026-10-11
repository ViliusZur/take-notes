import "server-only";
import { env } from "@/server/env";
import { features } from "@/server/features";
import { HttpError } from "@/server/http";
import { SimulatedVoiceProvider } from "./simulated";
import type { VoiceProvider } from "./types";
import { VapiProvider } from "./vapi";

const globalForVoice = globalThis as unknown as { __weeklyVoice?: VoiceProvider };

let override: VoiceProvider | undefined;

export function setVoiceProviderForTests(provider: VoiceProvider | undefined) {
  override = provider;
}

function createProvider(choice: "vapi" | "simulated"): VoiceProvider {
  if (choice === "simulated") return new SimulatedVoiceProvider();
  const { VAPI_API_KEY, VAPI_PHONE_NUMBER_ID, VAPI_WEBHOOK_SECRET, VOICE_MODEL } = env();
  return new VapiProvider(VAPI_API_KEY!, VAPI_PHONE_NUMBER_ID!, VAPI_WEBHOOK_SECRET!, VOICE_MODEL);
}

/** The configured voice provider. Throws 501 when calls aren't set up on this server. */
export function voiceProvider(): VoiceProvider {
  if (override) return override;
  const choice = features().voice;
  if (!choice) throw new HttpError(501, "Planning calls are not set up on this server");
  globalForVoice.__weeklyVoice ??= createProvider(choice);
  return globalForVoice.__weeklyVoice;
}

export type { VoiceEvent, VoiceProvider, StartCallInput, CallOutcome } from "./types";
export { SimulatedVoiceProvider } from "./simulated";
