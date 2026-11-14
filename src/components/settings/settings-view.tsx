"use client";

import { useQuery } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import { api } from "@/lib/api-client";
import type { FeaturesDto, MeDto, PlanningScheduleDto } from "@/lib/api-types";
import { CallsCard } from "./calls-card";
import { useEncryption } from "@/components/encryption/encryption-provider";
import { DangerCard } from "./danger-card";
import { EncryptionCard } from "./encryption-card";
import { PhoneCard } from "./phone-card";
import { ProfileCard } from "./profile-card";
import { ScheduleCard } from "./schedule-card";
import { SetupCard } from "./setup-card";
import { AppearanceCard } from "./appearance-card";

export function SettingsView({ features }: { features: FeaturesDto }) {
  const encryption = useEncryption();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<MeDto>("/api/v1/me") });
  const schedule = useQuery({
    queryKey: ["schedule"],
    queryFn: () => api<PlanningScheduleDto>("/api/v1/me/planning-schedule"),
  });

  if (me.isError || schedule.isError) {
    return <p className="text-sm text-destructive">Could not load your settings. Refresh to try again.</p>;
  }
  if (!me.data || !schedule.data) {
    return (
      <p className="flex min-h-[50dvh] items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
        <LoaderCircle className="size-4 animate-spin" aria-hidden /> Loading settings…
      </p>
    );
  }

  // Planning calls need to read the plan, so they are off while encryption is on.
  const encrypted = encryption.status?.enabled ?? me.data.encryptionEnabled;

  return (
    <div className="mx-auto max-w-2xl space-y-4 sm:space-y-6">
      <header>
        <p className="text-sm font-medium text-muted-foreground">{me.data.email}</p>
        <h1 className="text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">Settings</h1>
      </header>
      {(features.email || features.calls) && (
        <ScheduleCard me={me.data} schedule={schedule.data} features={features} encrypted={encrypted} />
      )}
      {features.calls && <PhoneCard me={me.data} features={features} />}
      {features.calls && (
        <CallsCard me={me.data} schedule={schedule.data} features={features} encrypted={encrypted} />
      )}
      <EncryptionCard features={features} />
      <ProfileCard me={me.data} />
      <AppearanceCard />
      {(!features.email || !features.calls) && <SetupCard features={features} />}
      <DangerCard />
    </div>
  );
}
