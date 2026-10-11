import "server-only";
import { timingSafeEqual } from "node:crypto";
import { appUrl } from "@/server/env";
import { HttpError } from "@/server/http";
import { log } from "@/server/log";
import type { CallOutcome, StartCallInput, VoiceEvent, VoiceProvider } from "./types";

const API = "https://api.vapi.ai";
const SECRET_HEADER = "x-vapi-secret";

const COMPLETED_REASONS = new Set([
  "customer-ended-call",
  "assistant-ended-call",
  "assistant-said-end-call-phrase",
  "assistant-ended-call-after-message-spoken",
  "assistant-ended-call-with-hangup-task",
  "exceeded-max-duration",
  "silence-timed-out",
]);

const NO_ANSWER_REASONS = new Set(["customer-did-not-answer", "customer-busy", "voicemail"]);

export function classifyEndedReason(reason: string): CallOutcome {
  if (COMPLETED_REASONS.has(reason)) return "completed";
  if (NO_ANSWER_REASONS.has(reason)) return "no_answer";
  if (reason.includes("408-request-timeout") || reason.includes("480-temporarily-unavailable")) {
    return "no_answer";
  }
  return "failed";
}

type VapiMessage = {
  type?: string;
  status?: string;
  endedReason?: string;
  startedAt?: string;
  endedAt?: string;
  cost?: number;
  artifact?: { transcript?: string; messages?: { role?: string; message?: string }[] };
  call?: {
    id?: string;
    startedAt?: string;
    endedAt?: string;
    customer?: { externalId?: string };
    assistant?: { metadata?: { callId?: string } };
  };
  assistant?: { metadata?: { callId?: string } };
  customer?: { externalId?: string };
};

function transcriptOf(message: VapiMessage) {
  if (message.artifact?.transcript) return message.artifact.transcript;
  return (message.artifact?.messages ?? [])
    .filter((entry) => entry.message && (entry.role === "user" || entry.role === "bot" || entry.role === "assistant"))
    .map((entry) => `${entry.role === "user" ? "User" : "AI"}: ${entry.message}`)
    .join("\n");
}

function parseDate(value: string | undefined) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Maps a Vapi server message to our events. Exported for tests. */
export function mapVapiMessage(message: VapiMessage): VoiceEvent[] {
  const providerCallId = message.call?.id;
  if (!providerCallId) return [];
  const callId =
    message.call?.assistant?.metadata?.callId ??
    message.assistant?.metadata?.callId ??
    message.call?.customer?.externalId ??
    message.customer?.externalId;

  if (message.type === "status-update") {
    if (message.status === "ringing") return [{ kind: "status", providerCallId, callId, status: "ringing" }];
    if (message.status === "in-progress") {
      return [{ kind: "status", providerCallId, callId, status: "in_progress" }];
    }
    // Completed calls are handled by the end-of-call-report, which carries the transcript.
    if (message.status === "ended" && message.endedReason) {
      const outcome = classifyEndedReason(message.endedReason);
      if (outcome === "completed") return [];
      return [{ kind: "ended", providerCallId, callId, outcome, endedReason: message.endedReason, transcript: "" }];
    }
    return [];
  }

  if (message.type === "end-of-call-report") {
    const endedReason = message.endedReason ?? "unknown";
    return [
      {
        kind: "ended",
        providerCallId,
        callId,
        outcome: classifyEndedReason(endedReason),
        endedReason,
        transcript: transcriptOf(message),
        startedAt: parseDate(message.startedAt ?? message.call?.startedAt),
        endedAt: parseDate(message.endedAt ?? message.call?.endedAt),
        costCents: typeof message.cost === "number" ? Math.round(message.cost * 100) : undefined,
      },
    ];
  }

  return [];
}

function secretsMatch(received: string | null, expected: string) {
  if (!received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export class VapiProvider implements VoiceProvider {
  readonly name = "vapi";

  constructor(
    private readonly apiKey: string,
    private readonly phoneNumberId: string,
    private readonly webhookSecret: string,
    private readonly model: string,
  ) {}

  private headers() {
    return { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" };
  }

  async startCall(input: StartCallInput) {
    const body = {
      phoneNumberId: this.phoneNumberId,
      customer: { number: input.toNumber, name: input.customerName, externalId: input.callId },
      assistant: {
        name: "Weekly planning assistant",
        firstMessage: input.firstMessage,
        firstMessageMode: "assistant-speaks-first",
        model: {
          provider: "anthropic",
          model: this.model,
          messages: [{ role: "system", content: input.systemPrompt }],
          tools: [{ type: "endCall" }],
        },
        voice: { provider: "vapi", voiceId: "Elliot" },
        transcriber: { provider: "deepgram", model: "nova-3", language: "en" },
        maxDurationSeconds: input.maxDurationSeconds,
        voicemailDetection: { provider: "vapi" },
        artifactPlan: { recordingEnabled: false, loggingEnabled: false, pcapEnabled: false },
        analysisPlan: { summaryPlan: { enabled: false } },
        serverMessages: ["end-of-call-report", "status-update"],
        server: {
          url: `${appUrl()}/api/webhooks/voice`,
          timeoutSeconds: 20,
          headers: { [SECRET_HEADER]: this.webhookSecret },
          backoffPlan: { type: "exponential", maxRetries: 3, baseDelaySeconds: 2 },
        },
        metadata: { callId: input.callId, userId: input.userId },
      },
    };

    const response = await fetch(`${API}/call`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      log.error(`Vapi call creation failed with status ${response.status}`, await response.text());
      throw new Error(`Voice provider rejected the call (${response.status})`);
    }
    const created = (await response.json()) as { id: string };
    log.debug(`Vapi call '${created.id}' created for call '${input.callId}'`);
    return { providerCallId: created.id };
  }

  async parseWebhook(request: Request) {
    if (!secretsMatch(request.headers.get(SECRET_HEADER), this.webhookSecret)) {
      log.error("Vapi webhook request verification failed");
      throw new HttpError(401, "Invalid webhook secret");
    }
    const payload = (await request.json()) as { message?: VapiMessage };
    if (!payload.message) return [];
    return mapVapiMessage(payload.message);
  }

  async deleteCallData(providerCallId: string) {
    const response = await fetch(`${API}/call/${encodeURIComponent(providerCallId)}`, {
      method: "DELETE",
      headers: this.headers(),
      body: "{}",
    });
    if (!response.ok) {
      log.error(`Failed to delete Vapi call '${providerCallId}' with status ${response.status}`);
      throw new Error("Voice provider call deletion failed");
    }
  }
}
