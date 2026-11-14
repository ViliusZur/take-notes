"use client";

import { LockKeyhole } from "lucide-react";
import Link from "next/link";
import { createContext, useContext, useId, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/lib/api-client";
import { formatLockTimeout, plainCodec, vaultCodec, WrongPasswordError, type ContentCodec } from "@/lib/encryption";
import { cn } from "@/lib/utils";
import { useEncryption } from "./encryption-provider";
import { PasswordInput } from "./password-input";

const CodecContext = createContext<ContentCodec | null>(null);

/** How planner content is stored and read; only available inside `EncryptionGate`. */
export function useCodec() {
  const codec = useContext(CodecContext);
  if (!codec) throw new Error("useCodec must be used inside EncryptionGate");
  return codec;
}

/**
 * Shows planner content only when it can be read: always for plain notebooks, and after unlocking
 * for encrypted ones. `encrypted` is the server's answer at render time, used until the status loads.
 */
export function EncryptionGate({ encrypted, children }: { encrypted: boolean; children: ReactNode }) {
  const { status, vault } = useEncryption();
  const isEncrypted = status?.enabled ?? encrypted;
  const codec = useMemo(() => (!isEncrypted ? plainCodec : vault ? vaultCodec(vault.key) : null), [isEncrypted, vault]);

  if (!codec) return <UnlockScreen />;
  return <CodecContext.Provider value={codec}>{children}</CodecContext.Provider>;
}

function UnlockScreen() {
  const { status, lastLockReason } = useEncryption();
  if (!status) {
    return (
      <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground" role="status">
        Checking encryption…
      </div>
    );
  }

  const reason =
    lastLockReason === "idle"
      ? `It locked itself after ${formatLockTimeout(status.lockTimeoutMinutes)} without activity.`
      : lastLockReason === "rejected"
        ? "The encryption password was changed on another device, so unlock with the new one."
        : "Your notes and tasks are encrypted. Enter your encryption password to read them on this device.";

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col justify-center">
      <div className="paper-grid space-y-5 rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        <span className="inline-flex size-11 items-center justify-center rounded-xl bg-hl-violet text-hl-violet-fg">
          <LockKeyhole className="size-5" aria-hidden />
        </span>
        <div className="space-y-1.5">
          <h1 className="font-display text-2xl font-bold tracking-tight">Your notebook is locked</h1>
          <p className="text-sm text-muted-foreground">{reason}</p>
        </div>
        <UnlockForm autoFocus />
        <p className="text-xs leading-5 text-muted-foreground">
          Forgot the password? Nobody can recover it or your notes and tasks, not even the people running this app.{" "}
          <Link href="/settings" className="underline underline-offset-4">
            Settings
          </Link>{" "}
          still work while locked.
        </p>
      </div>
    </div>
  );
}

export function UnlockForm({ autoFocus = false, className }: { autoFocus?: boolean; className?: string }) {
  const { unlock } = useEncryption();
  const id = useId();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!password) return;
    setPending(true);
    setError(null);
    try {
      await unlock(password);
      setPassword("");
    } catch (caught) {
      setError(caught instanceof WrongPasswordError ? "That password didn't work. Try again." : errorMessage(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className={cn("space-y-2", className)}>
      <Label htmlFor={id}>Encryption password</Label>
      <div className="flex gap-2">
        <PasswordInput
          id={id}
          autoComplete="current-password"
          autoFocus={autoFocus}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-invalid={error !== null}
          aria-describedby={error ? `${id}-error` : undefined}
          disabled={pending}
        />
        <Button type="submit" disabled={pending || !password}>
          {pending ? "Unlocking…" : "Unlock"}
        </Button>
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
