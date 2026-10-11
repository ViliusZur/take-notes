import { after } from "next/server";
import { route } from "@/server/http";
import { handleVoiceEvent, processCall } from "@/server/modules/calls/service";
import { voiceProvider } from "@/server/modules/voice";

export const maxDuration = 120;

/** Signed call events from the voice platform. Acknowledges fast; extraction runs after the response. */
export const POST = route(async (request) => {
  const events = await voiceProvider().parseWebhook(request);
  for (const event of events) {
    const { callId, process } = await handleVoiceEvent(event);
    if (process && callId) after(() => processCall(callId));
  }
  return Response.json({ received: true });
});
