export type StartCallInput = {
  /** Our call id; echoed back in webhooks for correlation. */
  callId: string;
  userId: string;
  toNumber: string;
  customerName: string;
  systemPrompt: string;
  firstMessage: string;
  maxDurationSeconds: number;
};

export type CallOutcome = "completed" | "no_answer" | "failed";

export type VoiceEvent =
  | {
      kind: "status";
      providerCallId: string;
      callId?: string;
      status: "ringing" | "in_progress";
    }
  | {
      kind: "ended";
      providerCallId: string;
      callId?: string;
      outcome: CallOutcome;
      endedReason: string;
      transcript: string;
      startedAt?: Date;
      endedAt?: Date;
      costCents?: number;
    };

export interface VoiceProvider {
  readonly name: string;
  startCall(input: StartCallInput): Promise<{ providerCallId: string }>;
  /** Verifies the request and maps it to events. Unknown event types map to []. */
  parseWebhook(request: Request): Promise<VoiceEvent[]>;
  /** Removes the call and its transcript from the provider after we processed it. */
  deleteCallData(providerCallId: string): Promise<void>;
}
