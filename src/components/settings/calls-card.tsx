"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PhoneCall } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, errorMessage } from "@/lib/api-client";
import type { CallDetailDto, CallDto, CallStatus, FeaturesDto, MeDto, PlanningScheduleDto } from "@/lib/api-types";
import { formatWeekKey, weekPath } from "@/lib/weeks";

const ACTIVE: CallStatus[] = ["queued", "ringing", "in_progress", "ended"];

const STATUS_LABEL: Record<CallStatus, string> = {
  queued: "Dialing",
  ringing: "Ringing",
  in_progress: "On the call",
  ended: "Writing your plan",
  no_answer: "No answer",
  failed: "Failed",
  processed: "Done",
};

function formatWhen(iso: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

function formatDuration(seconds: number | null) {
  if (!seconds) return null;
  const minutes = Math.floor(seconds / 60);
  return minutes ? `${minutes} min ${seconds % 60} s` : `${seconds} s`;
}

export function CallsCard({
  me,
  schedule,
  features,
}: {
  me: MeDto;
  schedule: PlanningScheduleDto;
  features: FeaturesDto;
}) {
  const queryClient = useQueryClient();
  const [transcriptFor, setTranscriptFor] = useState<string | null>(null);
  const { data: calls } = useQuery({
    queryKey: ["calls"],
    queryFn: () => api<CallDto[]>("/api/v1/calls"),
    refetchInterval: (query) => (query.state.data?.some((call) => ACTIVE.includes(call.status)) ? 3000 : false),
  });

  const callNow = useMutation({
    mutationFn: () => api<CallDto>("/api/v1/calls", { method: "POST" }),
    onSuccess: (call) => {
      if (call.status === "failed") toast.error(call.error ?? "The call could not be placed");
      else toast.success("Calling you now.");
      void queryClient.invalidateQueries({ queryKey: ["calls"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const undo = useMutation({
    mutationFn: (callId: string) => api(`/api/v1/calls/${callId}/plan-import`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Removed everything the call added.");
      void queryClient.invalidateQueries({ queryKey: ["calls"] });
      void queryClient.invalidateQueries({ queryKey: ["week"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const canCall = me.phoneVerified && Boolean(schedule.callConsentAt);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Planning calls</CardTitle>
        <CardDescription>
          {canCall
            ? "Try a call now, or look back at what was planned on past calls."
            : "Verify your phone and choose AI phone call above to get planning calls."}
          {features.simulatedCalls && " Demo mode: calls are simulated with a sample conversation, your phone won't ring."}
        </CardDescription>
        <CardAction>
          <Button size="sm" disabled={!canCall || callNow.isPending} onClick={() => callNow.mutate()}>
            <PhoneCall aria-hidden /> Call me now
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="pt-5">
        {!calls?.length ? (
          <p className="text-sm text-muted-foreground">No calls yet.</p>
        ) : (
          <ul className="divide-y">
            {calls.map((call) => {
              const week = { isoYear: call.targetIsoYear, isoWeek: call.targetIsoWeek };
              return (
                <li key={call.id} className="space-y-1 py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium">{formatWhen(call.createdAt)}</span>
                    <Badge variant={call.status === "failed" ? "destructive" : "secondary"}>
                      {STATUS_LABEL[call.status]}
                    </Badge>
                    {call.trigger === "retry" && <span className="text-xs text-muted-foreground">retry</span>}
                    {call.trigger === "manual" && <span className="text-xs text-muted-foreground">test call</span>}
                    {formatDuration(call.durationSeconds) && (
                      <span className="text-xs text-muted-foreground">{formatDuration(call.durationSeconds)}</span>
                    )}
                  </div>
                  {call.summary && <p className="text-sm text-muted-foreground">{call.summary}</p>}
                  {call.error && <p className="text-sm text-destructive">{call.error}</p>}
                  <div className="flex flex-wrap gap-1">
                    <Button asChild variant="link" size="sm" className="h-auto px-0 pr-3">
                      <Link href={weekPath(week)}>Open {formatWeekKey(week)}</Link>
                    </Button>
                    {call.status === "processed" && (
                      <Button
                        variant="link"
                        size="sm"
                        className="h-auto px-0 pr-3"
                        onClick={() => setTranscriptFor(call.id)}
                      >
                        Transcript
                      </Button>
                    )}
                    {call.canUndoImport && (
                      <Button
                        variant="link"
                        size="sm"
                        className="h-auto px-0 text-muted-foreground"
                        disabled={undo.isPending}
                        onClick={() => undo.mutate(call.id)}
                      >
                        Undo import
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
      <TranscriptDialog callId={transcriptFor} onClose={() => setTranscriptFor(null)} />
    </Card>
  );
}

function TranscriptDialog({ callId, onClose }: { callId: string | null; onClose: () => void }) {
  const { data, isPending } = useQuery({
    queryKey: ["call", callId],
    queryFn: () => api<CallDetailDto>(`/api/v1/calls/${callId}`),
    enabled: callId !== null,
  });

  return (
    <Dialog open={callId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Call transcript</DialogTitle>
          <DialogDescription>Transcripts are deleted 30 days after the call.</DialogDescription>
        </DialogHeader>
        {isPending ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : data?.transcript ? (
          <pre className="text-sm leading-6 whitespace-pre-wrap">{data.transcript}</pre>
        ) : (
          <p className="text-sm text-muted-foreground">This transcript has been deleted.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
