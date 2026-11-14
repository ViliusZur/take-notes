"use client";

import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, onEncryptionSignal, setUnlockProof } from "@/lib/api-client";
import type { EncryptionStatusDto } from "@/lib/api-types";
import { openVault, type Vault } from "@/lib/encryption";

export const ENCRYPTION_QUERY_KEY = ["encryption"] as const;

/** Queries that hold decrypted planner content; dropped from memory whenever the notebook locks. */
const CONTENT_QUERY_KEYS = [["week"], ["weeks"]] as const;

/** Tabs of this app tell each other about activity and locking, so the timeout follows the user, not the tab. */
const CHANNEL_NAME = "weekly-notes-encryption";
const ACTIVITY_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart", "scroll"] as const;
type ChannelMessage = { type: "activity"; at: number } | { type: "lock" };

export type LockReason = "manual" | "idle" | "elsewhere" | "rejected";

type EncryptionContextValue = {
  /** Undefined until loaded. */
  status: EncryptionStatusDto | undefined;
  /** The unlocked data key; only ever in this tab's memory. */
  vault: Vault | null;
  lastLockReason: LockReason | null;
  /** Throws `WrongPasswordError`. */
  unlock: (password: string) => Promise<void>;
  lock: (reason?: LockReason) => Promise<void>;
  /** Use a vault created in this tab (encryption turned on, password changed) without asking for the password again. */
  adopt: (vault: Vault, status: EncryptionStatusDto) => void;
  /** Encryption was turned off: content is plain text from now on. */
  forget: (status: EncryptionStatusDto) => void;
};

const EncryptionContext = createContext<EncryptionContextValue | null>(null);

export function useEncryption() {
  const value = useContext(EncryptionContext);
  if (!value) throw new Error("useEncryption must be used inside EncryptionProvider");
  return value;
}

function fetchStatus() {
  return api<EncryptionStatusDto>("/api/v1/me/encryption");
}

/** Lets in-flight saves finish (up to a few seconds) so locking never drops an edit. */
async function waitForWrites(queryClient: QueryClient, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  await new Promise((resolve) => setTimeout(resolve, 0));
  while (queryClient.isMutating() > 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/**
 * Holds the encryption state of the signed-in user's notebook for the app pages.
 *
 * The data key lives only in memory: a reload, closing the tab, signing out, or the lock timeout
 * forgets it, and decrypted content is dropped from the query cache at the same time.
 */
export function EncryptionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { data: status } = useQuery({ queryKey: ENCRYPTION_QUERY_KEY, queryFn: fetchStatus });
  const [vault, setVault] = useState<Vault | null>(null);
  const [lastLockReason, setLastLockReason] = useState<LockReason | null>(null);
  const [lockCount, setLockCount] = useState(0);
  const vaultRef = useRef<Vault | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);

  const applyVault = useCallback((next: Vault | null) => {
    // The proof goes with the very next request, before React re-renders.
    vaultRef.current = next;
    setUnlockProof(next?.proof ?? null);
    setVault(next);
  }, []);

  const lock = useCallback(
    async (reason: LockReason = "manual") => {
      if (!vaultRef.current) return;
      if (reason !== "rejected") {
        // Blurring the focused editor saves its draft; then wait for saves to reach the server.
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        await waitForWrites(queryClient);
      }
      if (!vaultRef.current) return;
      applyVault(null);
      setLastLockReason(reason);
      setLockCount((count) => count + 1);
      if (reason !== "elsewhere") channelRef.current?.postMessage({ type: "lock" } satisfies ChannelMessage);
    },
    [applyVault, queryClient],
  );

  const lockRef = useRef(lock);
  useEffect(() => {
    lockRef.current = lock;
  }, [lock]);

  const unlock = useCallback(
    async (password: string) => {
      // Always the latest keys: the password may have been changed on another device.
      const current = await queryClient.fetchQuery({ queryKey: ENCRYPTION_QUERY_KEY, queryFn: fetchStatus, staleTime: 0 });
      if (!current.enabled || !current.keys) return;
      applyVault(await openVault(password, current.keys));
      setLastLockReason(null);
    },
    [applyVault, queryClient],
  );

  const adopt = useCallback(
    (next: Vault, nextStatus: EncryptionStatusDto) => {
      queryClient.setQueryData(ENCRYPTION_QUERY_KEY, nextStatus);
      applyVault(next);
      setLastLockReason(null);
    },
    [applyVault, queryClient],
  );

  const forget = useCallback(
    (nextStatus: EncryptionStatusDto) => {
      queryClient.setQueryData(ENCRYPTION_QUERY_KEY, nextStatus);
      applyVault(null);
      setLastLockReason(null);
    },
    [applyVault, queryClient],
  );

  // Once locked (and the planner unmounted), drop decrypted content from memory.
  useEffect(() => {
    if (lockCount === 0) return;
    for (const queryKey of CONTENT_QUERY_KEYS) queryClient.removeQueries({ queryKey });
  }, [lockCount, queryClient]);

  // Leaving the app pages (signing out) forgets the key and what it decrypted.
  useEffect(() => {
    const held = vaultRef;
    return () => {
      setUnlockProof(null);
      if (!held.current) return;
      held.current = null;
      for (const queryKey of CONTENT_QUERY_KEYS) queryClient.removeQueries({ queryKey, type: "inactive" });
    };
  }, [queryClient]);

  // The server refused the proof (password changed elsewhere), or encryption was turned off elsewhere.
  useEffect(
    () =>
      onEncryptionSignal((signal) => {
        void queryClient.invalidateQueries({ queryKey: ENCRYPTION_QUERY_KEY });
        if (signal === "locked") void lockRef.current("rejected");
        else window.location.reload();
      }),
    [queryClient],
  );

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channelRef.current = channel;
    channel.addEventListener("message", (event: MessageEvent<ChannelMessage>) => {
      if (event.data?.type === "lock") void lockRef.current("elsewhere");
    });
    return () => {
      channelRef.current = null;
      channel.close();
    };
  }, []);

  // Lock after the chosen time without keyboard, pointer, touch, or scroll activity in any tab.
  const timeoutMinutes = status?.enabled ? status.lockTimeoutMinutes : null;
  useEffect(() => {
    if (!vault || timeoutMinutes === null) return;
    const timeoutMs = timeoutMinutes * 60_000;
    let lastActivity = Date.now();
    let lastShared = 0;

    const onActivity = () => {
      lastActivity = Date.now();
      if (lastActivity - lastShared > 5_000) {
        lastShared = lastActivity;
        channelRef.current?.postMessage({ type: "activity", at: lastActivity } satisfies ChannelMessage);
      }
    };
    const onMessage = (event: MessageEvent<ChannelMessage>) => {
      if (event.data?.type === "activity") lastActivity = Math.max(lastActivity, event.data.at);
    };
    // Checked on an interval rather than a single timer, so time asleep or in a background tab counts.
    const check = () => {
      if (Date.now() - lastActivity >= timeoutMs) void lockRef.current("idle");
    };

    for (const name of ACTIVITY_EVENTS) window.addEventListener(name, onActivity, { capture: true, passive: true });
    document.addEventListener("visibilitychange", check);
    const channel = channelRef.current;
    channel?.addEventListener("message", onMessage);
    const interval = setInterval(check, Math.min(5_000, timeoutMs / 4));
    return () => {
      for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, onActivity, { capture: true });
      document.removeEventListener("visibilitychange", check);
      channel?.removeEventListener("message", onMessage);
      clearInterval(interval);
    };
  }, [vault, timeoutMinutes]);

  const value = useMemo(
    () => ({ status, vault, lastLockReason, unlock, lock, adopt, forget }),
    [status, vault, lastLockReason, unlock, lock, adopt, forget],
  );
  return <EncryptionContext.Provider value={value}>{children}</EncryptionContext.Provider>;
}
