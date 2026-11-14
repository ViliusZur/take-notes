"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Lock, LockKeyhole, LockOpen, TriangleAlert } from "lucide-react";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { UnlockForm } from "@/components/encryption/encryption-gate";
import { ENCRYPTION_QUERY_KEY, useEncryption } from "@/components/encryption/encryption-provider";
import { changePassword, turnOffEncryption, turnOnEncryption } from "@/components/encryption/notebook-conversion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, errorMessage } from "@/lib/api-client";
import type { EncryptionStatusDto, FeaturesDto } from "@/lib/api-types";
import {
  DEFAULT_LOCK_TIMEOUT,
  formatLockTimeout,
  LOCK_TIMEOUT_OPTIONS,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
} from "@/lib/encryption";
import { Field, NativeSelect } from "./field";

type Dialogs = "enable" | "change" | "disable" | null;

export function EncryptionCard({ features }: { features: FeaturesDto }) {
  const { status, vault, lock } = useEncryption();
  const [dialog, setDialog] = useState<Dialogs>(null);
  const close = () => setDialog(null);

  if (!status) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Encryption</CardTitle>
          <CardDescription>Loading…</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const unlocked = vault !== null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          Encryption
          {status.enabled ? (
            <Badge variant="secondary" className="gap-1">
              {unlocked ? <LockOpen aria-hidden /> : <LockKeyhole aria-hidden />}
              {unlocked ? "On · unlocked" : "On · locked"}
            </Badge>
          ) : (
            <Badge variant="outline">Off</Badge>
          )}
        </CardTitle>
        <CardDescription>
          {status.enabled
            ? "Your notes and tasks are encrypted with your encryption password and decrypted only in your browser. Nobody else can read them, including the people running this app."
            : "Encrypt your notes and tasks with a password only you know. They're decrypted only in your browser, so nobody else can read them, including the people running this app. Without encryption they're stored as plain text, readable by anyone with access to the database."}
        </CardDescription>
        {!status.enabled && (
          <CardAction>
            <Button size="sm" onClick={() => setDialog("enable")}>
              <Lock aria-hidden /> Turn on
            </Button>
          </CardAction>
        )}
        {status.enabled && unlocked && (
          <CardAction>
            <Button size="sm" variant="outline" onClick={() => void lock()}>
              <Lock aria-hidden /> Lock now
            </Button>
          </CardAction>
        )}
      </CardHeader>

      {status.enabled && (
        <CardContent className="space-y-5 pt-5">
          {!unlocked && (
            <div className="space-y-3 rounded-lg border bg-muted/40 p-4">
              <p className="text-sm text-muted-foreground">
                Unlock to change the lock timeout or the password, or to turn encryption off.
              </p>
              <UnlockForm className="max-w-md" />
            </div>
          )}
          <LockTimeoutField status={status} disabled={!unlocked} />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={!unlocked} onClick={() => setDialog("change")}>
              <KeyRound aria-hidden /> Change password
            </Button>
            <Button variant="outline" size="sm" disabled={!unlocked} onClick={() => setDialog("disable")}>
              <LockOpen aria-hidden /> Turn off encryption
            </Button>
          </div>
        </CardContent>
      )}

      <EnableDialog open={dialog === "enable"} onClose={close} features={features} />
      {unlocked && <ChangePasswordDialog open={dialog === "change"} onClose={close} />}
      {unlocked && <DisableDialog open={dialog === "disable"} onClose={close} />}
    </Card>
  );
}

/** Refreshes what turning encryption on or off changes elsewhere in settings. */
function useRefreshSettings() {
  const queryClient = useQueryClient();
  return () => {
    for (const queryKey of [["me"], ["schedule"], ["calls"], ["week"], ["weeks"]]) {
      void queryClient.invalidateQueries({ queryKey });
    }
  };
}

function LockTimeoutField({ status, disabled }: { status: EncryptionStatusDto; disabled: boolean }) {
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: (lockTimeoutMinutes: number) =>
      api<EncryptionStatusDto>("/api/v1/me/encryption", { method: "PATCH", body: { lockTimeoutMinutes } }),
    onSuccess: (saved) => {
      queryClient.setQueryData(ENCRYPTION_QUERY_KEY, saved);
      toast.success(`Your notebook now locks after ${formatLockTimeout(saved.lockTimeoutMinutes)} without activity.`);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Field
      id="encryption-timeout"
      label="Lock after inactivity"
      hint="With no typing, clicking, touching, or scrolling for this long, your notebook locks and needs the password again. Reloading the page also locks it."
      className="max-w-sm"
    >
      <NativeSelect
        id="encryption-timeout"
        value={status.lockTimeoutMinutes}
        disabled={disabled || save.isPending}
        onChange={(event) => save.mutate(Number(event.target.value))}
      >
        <LockTimeoutOptions />
      </NativeSelect>
    </Field>
  );
}

function LockTimeoutOptions() {
  return LOCK_TIMEOUT_OPTIONS.map((minutes) => (
    <option key={minutes} value={minutes}>
      {formatLockTimeout(minutes)}
    </option>
  ));
}

function ForgottenPasswordWarning({ children }: { children?: ReactNode }) {
  return (
    <div role="note" className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
      <p className="flex items-center gap-2 font-semibold text-destructive">
        <TriangleAlert className="size-4 shrink-0" aria-hidden /> A forgotten password can&apos;t be recovered
      </p>
      <ul className="list-disc space-y-1 pl-5 text-foreground/90">
        <li>If you forget this password, your account stays locked and your notes and tasks are lost forever.</li>
        <li>Nobody can reset it or read your data for you. Not support, not the admin, not the people running this app.</li>
        <li>Store it somewhere safe, like a password manager.</li>
        {children}
      </ul>
    </div>
  );
}

/** New password + confirmation + "I understand", shared by turning on and changing the password. */
function usePasswordForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function validate() {
    if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
    if (password.length > MAX_PASSWORD_LENGTH) return `Use at most ${MAX_PASSWORD_LENGTH} characters.`;
    if (password !== confirm) return "The passwords don't match.";
    if (!acknowledged) return "Confirm that you understand a forgotten password can't be recovered.";
    return null;
  }

  function reset() {
    setPassword("");
    setConfirm("");
    setAcknowledged(false);
    setError(null);
  }

  return { password, setPassword, confirm, setConfirm, acknowledged, setAcknowledged, error, setError, validate, reset };
}

function PasswordFields({ form, label }: { form: ReturnType<typeof usePasswordForm>; label: string }) {
  const id = useId();
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field
        id={`${id}-password`}
        label={label}
        hint={`At least ${MIN_PASSWORD_LENGTH} characters. A few random words work well. Don't reuse your sign-in password.`}
      >
        <Input
          id={`${id}-password`}
          type="password"
          autoComplete="new-password"
          value={form.password}
          onChange={(event) => form.setPassword(event.target.value)}
          maxLength={MAX_PASSWORD_LENGTH}
          required
        />
      </Field>
      <Field id={`${id}-confirm`} label="Repeat the password">
        <Input
          id={`${id}-confirm`}
          type="password"
          autoComplete="new-password"
          value={form.confirm}
          onChange={(event) => form.setConfirm(event.target.value)}
          maxLength={MAX_PASSWORD_LENGTH}
          required
        />
      </Field>
    </div>
  );
}

function Acknowledgement({ form }: { form: ReturnType<typeof usePasswordForm> }) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <Checkbox
        id={id}
        checked={form.acknowledged}
        onCheckedChange={(checked) => form.setAcknowledged(checked === true)}
        className="mt-0.5"
      />
      <Label htmlFor={id} className="text-sm leading-5 font-normal">
        I understand that if I forget this password, my notes and tasks can never be recovered, by anyone.
      </Label>
    </div>
  );
}

function FormError({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {error}
    </p>
  );
}

function EnableDialog({ open, onClose, features }: { open: boolean; onClose: () => void; features: FeaturesDto }) {
  const { adopt } = useEncryption();
  const refresh = useRefreshSettings();
  const form = usePasswordForm();
  const [lockTimeoutMinutes, setLockTimeoutMinutes] = useState<number>(DEFAULT_LOCK_TIMEOUT);
  const [pending, setPending] = useState(false);

  function close() {
    if (pending) return;
    form.reset();
    onClose();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const problem = form.validate();
    form.setError(problem);
    if (problem) return;
    setPending(true);
    try {
      const { vault, status } = await turnOnEncryption(form.password, lockTimeoutMinutes);
      adopt(vault, status);
      refresh();
      toast.success("Encryption is on. Your notes and tasks are encrypted.");
      form.reset();
      onClose();
    } catch (error) {
      form.setError(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Turn on encryption</DialogTitle>
            <DialogDescription>
              Your existing and future notes, big picture, tasks, and skip reasons are encrypted in this browser
              before they&apos;re saved. You&apos;ll enter this password to unlock your notebook on each device.
            </DialogDescription>
          </DialogHeader>
          <PasswordFields form={form} label="Encryption password" />
          <Field
            id="encryption-setup-timeout"
            label="Lock after inactivity"
            hint="Your notebook locks again after this long without any activity."
            className="max-w-xs"
          >
            <NativeSelect
              id="encryption-setup-timeout"
              value={lockTimeoutMinutes}
              onChange={(event) => setLockTimeoutMinutes(Number(event.target.value))}
            >
              <LockTimeoutOptions />
            </NativeSelect>
          </Field>
          <ForgottenPasswordWarning>
            {features.calls && (
              <li>Planning calls turn off and past call transcripts are deleted: the assistant can&apos;t read an encrypted plan.</li>
            )}
            <li>Dates, done/skipped status, and how many tasks you have stay visible to the server; their text doesn&apos;t.</li>
          </ForgottenPasswordWarning>
          <Acknowledgement form={form} />
          <FormError error={form.error} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Encrypting your notebook…" : "Encrypt my notebook"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ChangePasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { vault, adopt } = useEncryption();
  const form = usePasswordForm();
  const [pending, setPending] = useState(false);

  function close() {
    if (pending) return;
    form.reset();
    onClose();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const problem = form.validate();
    form.setError(problem);
    if (problem || !vault) return;
    setPending(true);
    try {
      const next = await changePassword(vault, form.password);
      adopt(next.vault, next.status);
      toast.success("Encryption password changed. Other devices need the new password.");
      form.reset();
      onClose();
    } catch (error) {
      form.setError(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Change encryption password</DialogTitle>
            <DialogDescription>
              Your notebook is re-encrypted with a new key. Other devices lock and need the new password.
            </DialogDescription>
          </DialogHeader>
          <PasswordFields form={form} label="New encryption password" />
          <ForgottenPasswordWarning />
          <Acknowledgement form={form} />
          <FormError error={form.error} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Re-encrypting…" : "Change password"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DisableDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { vault, forget } = useEncryption();
  const refresh = useRefreshSettings();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (!vault) return;
    setPending(true);
    setError(null);
    try {
      const status = await turnOffEncryption(vault);
      forget(status);
      refresh();
      toast.success("Encryption is off. Your notes and tasks are stored as plain text.");
      onClose();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !pending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Turn off encryption?</DialogTitle>
          <DialogDescription>
            Your notes and tasks are decrypted in this browser and saved as plain text. From then on, anyone with
            access to the database can read them.
          </DialogDescription>
        </DialogHeader>
        <FormError error={error} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Keep encryption
          </Button>
          <Button variant="destructive" onClick={() => void confirm()} disabled={pending}>
            {pending ? "Decrypting…" : "Turn off encryption"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
