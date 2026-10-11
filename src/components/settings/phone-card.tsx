"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api, errorMessage } from "@/lib/api-client";
import type { FeaturesDto, MeDto } from "@/lib/api-types";
import { Field } from "./field";

type Step = { kind: "idle" } | { kind: "enter" } | { kind: "code"; verificationId: string; phone: string };

export function PhoneCard({ me, features }: { me: MeDto; features: FeaturesDto }) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>({ kind: me.phoneVerified ? "idle" : "enter" });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["me"] });
    void queryClient.invalidateQueries({ queryKey: ["schedule"] });
  };

  const sendCode = useMutation({
    mutationFn: (phone: string) =>
      api<{ id: string }>("/api/v1/me/phone-verifications", { method: "POST", body: { phone } }),
    onSuccess: ({ id }, phone) => {
      setStep({ kind: "code", verificationId: id, phone });
      toast.success("We sent you a code by SMS.");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const confirm = useMutation({
    mutationFn: ({ verificationId, code }: { verificationId: string; code: string }) =>
      api(`/api/v1/me/phone-verifications/${verificationId}`, { method: "PATCH", body: { code } }),
    onSuccess: () => {
      setStep({ kind: "idle" });
      toast.success("Phone number verified.");
      refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: () => api("/api/v1/me/phone", { method: "DELETE" }),
    onSuccess: () => {
      setStep({ kind: "enter" });
      toast.success("Phone number removed. Planning calls are off.");
      refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  function submitPhone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    sendCode.mutate(String(new FormData(event.currentTarget).get("phone")));
  }

  function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step.kind !== "code") return;
    confirm.mutate({ verificationId: step.verificationId, code: String(new FormData(event.currentTarget).get("code")) });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Phone number</CardTitle>
        <CardDescription>
          Used only for your planning calls.{" "}
          {features.simulatedSms ? "Demo mode: any number works, no SMS is sent." : "We verify it with a code by SMS."}
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-5">
        {step.kind === "idle" && me.phoneE164 && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-medium tabular-nums">
              {me.phoneE164} <span className="ml-1 text-sm font-normal text-muted-foreground">verified</span>
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setStep({ kind: "enter" })}>
                Change
              </Button>
              <Button variant="ghost" size="sm" disabled={remove.isPending} onClick={() => remove.mutate()}>
                Remove
              </Button>
            </div>
          </div>
        )}

        {step.kind === "enter" && (
          <form onSubmit={submitPhone} className="flex flex-wrap items-end gap-3">
            <Field id="phone" label="Mobile number" className="min-w-56 flex-1" hint="International format, e.g. +37061234567.">
              <Input id="phone" name="phone" type="tel" autoComplete="tel" placeholder="+37061234567" required />
            </Field>
            <div className="flex gap-2 pb-6">
              {me.phoneVerified && (
                <Button type="button" variant="ghost" onClick={() => setStep({ kind: "idle" })}>
                  Cancel
                </Button>
              )}
              <Button type="submit" disabled={sendCode.isPending}>
                {sendCode.isPending ? "Sending…" : "Send code"}
              </Button>
            </div>
          </form>
        )}

        {step.kind === "code" && (
          <form onSubmit={submitCode} className="flex flex-wrap items-end gap-3">
            <Field
              id="code"
              label={`Code sent to ${step.phone}`}
              className="min-w-40 flex-1"
              hint={features.simulatedSms ? "Demo mode: no SMS is sent. Use 000000." : undefined}
            >
              <Input
                id="code"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{4,10}"
                required
                autoFocus
              />
            </Field>
            <div className="flex gap-2 pb-6">
              <Button type="button" variant="ghost" onClick={() => setStep({ kind: "enter" })}>
                Back
              </Button>
              <Button type="submit" disabled={confirm.isPending}>
                {confirm.isPending ? "Checking…" : "Verify"}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
