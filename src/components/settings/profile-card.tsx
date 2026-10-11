"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api, errorMessage } from "@/lib/api-client";
import type { MeDto } from "@/lib/api-types";
import { Field, NativeSelect, timezones } from "./field";

export function ProfileCard({ me }: { me: MeDto }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(me.name);
  const [timezone, setTimezone] = useState(me.timezone);
  const browserZone = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined;

  const save = useMutation({
    mutationFn: () => api<MeDto>("/api/v1/me", { method: "PATCH", body: { name, timezone } }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["me"], updated);
      void queryClient.invalidateQueries({ queryKey: ["schedule"] });
      toast.success("Profile saved.");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    save.mutate();
  }

  return (
    <Card>
      <form onSubmit={submit}>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Your timezone decides when your week starts and when we call.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 pt-5 sm:grid-cols-2">
          <Field id="profile-name" label="Name" hint="The assistant greets you by your first name.">
            <Input id="profile-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={100} required />
          </Field>
          <Field
            id="profile-timezone"
            label="Timezone"
            hint={
              browserZone && browserZone !== timezone ? (
                <button type="button" className="underline underline-offset-4" onClick={() => setTimezone(browserZone)}>
                  Use this device&apos;s timezone ({browserZone})
                </button>
              ) : undefined
            }
          >
            <NativeSelect id="profile-timezone" value={timezone} onChange={(event) => setTimezone(event.target.value)}>
              {timezones(timezone).map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </CardContent>
        <CardFooter className="justify-end pt-5">
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
