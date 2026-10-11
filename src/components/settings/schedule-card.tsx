"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { api, errorMessage } from "@/lib/api-client";
import type { FeaturesDto, MeDto, PlanningScheduleDto, ScheduleChannel } from "@/lib/api-types";
import { CALL_CONSENT_TEXT, EARLIEST_LOCAL_TIME, LATEST_LOCAL_TIME } from "@/lib/schedule";
import { Field, NativeSelect, timezones } from "./field";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function formatNextRun(iso: string | null, timezone: string) {
  if (!iso) return null;
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(iso));
}

type Props = { me: MeDto; schedule: PlanningScheduleDto; features: FeaturesDto };

export function ScheduleCard(props: Props) {
  // Remount the form whenever the saved schedule changes.
  return <ScheduleForm key={JSON.stringify(props.schedule)} {...props} />;
}

function ScheduleForm({ me, schedule, features }: Props) {
  const queryClient = useQueryClient();
  const channels: ScheduleChannel[] = [...(features.calls ? ["call" as const] : []), ...(features.email ? ["email" as const] : [])];
  const [enabled, setEnabled] = useState(schedule.enabled);
  const [channel, setChannel] = useState<ScheduleChannel>(
    channels.includes(schedule.channel) ? schedule.channel : channels[0],
  );
  const [dayOfWeek, setDayOfWeek] = useState(schedule.dayOfWeek);
  const [localTime, setLocalTime] = useState(schedule.localTime);
  const [timezone, setTimezone] = useState(schedule.timezone);
  const [emailFallback, setEmailFallback] = useState(schedule.emailFallback);
  const [consent, setConsent] = useState(false);
  const needsConsent = channel === "call" && !schedule.callConsentAt;

  const save = useMutation({
    mutationFn: () =>
      api<PlanningScheduleDto>("/api/v1/me/planning-schedule", {
        method: "PUT",
        body: { enabled, channel, dayOfWeek, localTime, timezone, emailFallback, callConsent: consent || undefined },
      }),
    onSuccess: (saved) => {
      queryClient.setQueryData(["schedule"], saved);
      toast.success(saved.enabled ? "Planning schedule saved." : "Planning reminders are off.");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    save.mutate();
  }

  const nextRun = formatNextRun(schedule.nextRunAt, schedule.timezone);

  return (
    <Card>
      <form onSubmit={submit}>
        <CardHeader>
          <CardTitle>Weekly planning</CardTitle>
          <CardDescription>
            {features.calls && features.email
              ? "Get a call from your AI planning assistant, or an email reminder, at the same time every week."
              : features.calls
                ? "Get a call from your AI planning assistant at the same time every week."
                : "Get an email reminder to plan at the same time every week."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 pt-5">
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="schedule-enabled">Plan with me every week</Label>
            <Switch id="schedule-enabled" checked={enabled} onCheckedChange={setEnabled} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="schedule-channel"
              label="How"
              hint={features.calls && !me.phoneVerified ? "Verify a phone number below to choose calls." : undefined}
            >
              <NativeSelect
                id="schedule-channel"
                value={channel}
                onChange={(event) => setChannel(event.target.value as ScheduleChannel)}
              >
                {features.calls && (
                  <option value="call" disabled={!me.phoneVerified}>
                    AI phone call
                  </option>
                )}
                {features.email && <option value="email">Email reminder</option>}
              </NativeSelect>
            </Field>
            <Field id="schedule-day" label="Day">
              <NativeSelect
                id="schedule-day"
                value={dayOfWeek}
                onChange={(event) => setDayOfWeek(Number(event.target.value))}
              >
                {DAYS.map((day, index) => (
                  <option key={day} value={index + 1}>
                    {day}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field id="schedule-time" label="Time" hint={`Between ${EARLIEST_LOCAL_TIME} and ${LATEST_LOCAL_TIME}.`}>
              <Input
                id="schedule-time"
                type="time"
                min={EARLIEST_LOCAL_TIME}
                max={LATEST_LOCAL_TIME}
                step={900}
                value={localTime}
                onChange={(event) => setLocalTime(event.target.value)}
                required
              />
            </Field>
            <Field id="schedule-timezone" label="Timezone">
              <NativeSelect id="schedule-timezone" value={timezone} onChange={(event) => setTimezone(event.target.value)}>
                {timezones(timezone).map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>

          {channel === "call" && features.email && (
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="schedule-fallback" className="font-normal">
                Email me if I miss the call
              </Label>
              <Switch id="schedule-fallback" checked={emailFallback} onCheckedChange={setEmailFallback} />
            </div>
          )}

          {needsConsent && (
            <div className="flex items-start gap-3 rounded-md border p-3">
              <Checkbox
                id="schedule-consent"
                checked={consent}
                onCheckedChange={(checked) => setConsent(checked === true)}
                className="mt-0.5"
              />
              <Label htmlFor="schedule-consent" className="text-sm leading-5 font-normal">
                {CALL_CONSENT_TEXT}
              </Label>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex flex-wrap items-center justify-between gap-3 pt-5">
          <p className="text-sm text-muted-foreground">
            {schedule.enabled && nextRun
              ? `Next ${schedule.channel === "call" && features.calls ? "call" : "reminder"}: ${nextRun}`
              : "Not scheduled."}
          </p>
          <Button type="submit" disabled={save.isPending || (needsConsent && !consent)}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
