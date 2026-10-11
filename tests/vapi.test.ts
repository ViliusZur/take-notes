import { describe, expect, it } from "vitest";
import { classifyEndedReason, mapVapiMessage, VapiProvider } from "@/server/modules/voice/vapi";

describe("Vapi ended reasons", () => {
  it("classifies outcomes", () => {
    expect(classifyEndedReason("customer-ended-call")).toBe("completed");
    expect(classifyEndedReason("assistant-ended-call")).toBe("completed");
    expect(classifyEndedReason("customer-did-not-answer")).toBe("no_answer");
    expect(classifyEndedReason("voicemail")).toBe("no_answer");
    expect(classifyEndedReason("customer-busy")).toBe("no_answer");
    expect(
      classifyEndedReason("call.in-progress.error-providerfault-outbound-sip-480-temporarily-unavailable"),
    ).toBe("no_answer");
    expect(classifyEndedReason("twilio-failed-to-connect-call")).toBe("failed");
  });
});

describe("Vapi messages", () => {
  const callId = "0b3f0a8e-6c49-4a43-9d0b-4c1f2c3d4e5f";

  it("maps an end-of-call report with transcript, cost, and our call id", () => {
    const [event] = mapVapiMessage({
      type: "end-of-call-report",
      endedReason: "customer-ended-call",
      startedAt: "2026-10-11T15:00:05Z",
      endedAt: "2026-10-11T15:03:12Z",
      cost: 0.214,
      artifact: { transcript: "AI: Hi\nUser: Plan the launch" },
      call: { id: "vapi-1", assistant: { metadata: { callId } } },
    });
    expect(event).toMatchObject({
      kind: "ended",
      providerCallId: "vapi-1",
      callId,
      outcome: "completed",
      transcript: "AI: Hi\nUser: Plan the launch",
      costCents: 21,
    });
  });

  it("builds a transcript from messages when the text transcript is missing", () => {
    const [event] = mapVapiMessage({
      type: "end-of-call-report",
      endedReason: "customer-ended-call",
      artifact: {
        messages: [
          { role: "bot", message: "Hi" },
          { role: "user", message: "Hello" },
        ],
      },
      call: { id: "vapi-2", customer: { externalId: callId } },
    });
    expect(event).toMatchObject({ callId, transcript: "AI: Hi\nUser: Hello" });
  });

  it("maps status updates and leaves completed endings to the report", () => {
    expect(mapVapiMessage({ type: "status-update", status: "ringing", call: { id: "v" } })).toEqual([
      { kind: "status", providerCallId: "v", callId: undefined, status: "ringing" },
    ]);
    expect(
      mapVapiMessage({ type: "status-update", status: "ended", endedReason: "customer-ended-call", call: { id: "v" } }),
    ).toEqual([]);
    expect(
      mapVapiMessage({ type: "status-update", status: "ended", endedReason: "voicemail", call: { id: "v" } }),
    ).toMatchObject([{ kind: "ended", outcome: "no_answer" }]);
    expect(mapVapiMessage({ type: "transcript", call: { id: "v" } })).toEqual([]);
  });
});

describe("Vapi webhook authentication", () => {
  const provider = new VapiProvider("key", "phone", "s3cret", "claude-sonnet-5");
  const body = JSON.stringify({ message: { type: "status-update", status: "ringing", call: { id: "v" } } });

  it("rejects a missing or wrong secret", async () => {
    await expect(provider.parseWebhook(new Request("https://x", { method: "POST", body }))).rejects.toMatchObject({
      status: 401,
    });
    await expect(
      provider.parseWebhook(new Request("https://x", { method: "POST", body, headers: { "x-vapi-secret": "nope" } })),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("accepts the shared secret", async () => {
    const events = await provider.parseWebhook(
      new Request("https://x", { method: "POST", body, headers: { "x-vapi-secret": "s3cret" } }),
    );
    expect(events).toHaveLength(1);
  });
});
