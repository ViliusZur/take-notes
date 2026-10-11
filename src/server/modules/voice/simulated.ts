import "server-only";
import { after } from "next/server";
import { log } from "@/server/log";
import type { StartCallInput, VoiceEvent, VoiceProvider } from "./types";

type EventSink = (event: VoiceEvent) => Promise<void>;

/** A canned planning conversation for demo mode. */
export function simulatedTranscript(name: string) {
  return [
    `AI: Hi ${name}, this is your AI planning assistant calling for your weekly plan. Is now a good time?`,
    "User: Yes, go ahead.",
    "AI: Great. What's the big picture for next week?",
    "User: Mainly I want to ship the onboarding flow and get more sleep.",
    "AI: Got it. What are the tasks you want to get done?",
    "User: Monday finish the signup screens. Tuesday review the pricing page with Anna. " +
      "I also need to write the investor update sometime this week, and Thursday I have the dentist at four.",
    "AI: Anything else to remember?",
    "User: Friday is my sister's birthday, don't let me forget to call her. " +
      "And note for the week: try the shorter standup format with the team.",
    "AI: So: ship onboarding and sleep more; signup screens Monday, pricing review Tuesday, " +
      "investor update this week, dentist Thursday at four, and call your sister on Friday. Did I get that right?",
    "User: Yes, perfect, thanks.",
    "AI: Your plan will be waiting in the app. Have a good week!",
  ].join("\n");
}

/**
 * Demo mode (`VOICE_PROVIDER=simulated`). "Places" a call and reports a completed
 * conversation a moment later, so the full pipeline can be tried without a phone.
 * Uses `after()` so the delivery also survives on serverless hosts.
 */
export class SimulatedVoiceProvider implements VoiceProvider {
  readonly name = "simulated";
  private sink: EventSink | undefined;

  setEventSink(sink: EventSink) {
    this.sink = sink;
  }

  async startCall(input: StartCallInput) {
    const providerCallId = `sim_${input.callId}`;
    const firstName = input.customerName.split(" ")[0] || "there";
    after(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      try {
        await this.sink?.({
          kind: "ended",
          providerCallId,
          callId: input.callId,
          outcome: "completed",
          endedReason: "customer-ended-call",
          transcript: simulatedTranscript(firstName),
          startedAt: new Date(Date.now() - 95_000),
          endedAt: new Date(),
          costCents: 0,
        });
      } catch (error) {
        log.error(`Simulated call '${input.callId}' failed`, error);
      }
    });
    return { providerCallId };
  }

  async parseWebhook(): Promise<VoiceEvent[]> {
    return [];
  }

  async deleteCallData() {}
}
