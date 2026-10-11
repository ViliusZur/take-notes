"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { authClient } from "@/lib/auth-client";

type Mode = "sign-in" | "sign-up";

function safeNext(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/week";
}

export function AuthForm({ mode, googleEnabled }: { mode: Mode; googleEnabled: boolean }) {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));
    setPending(true);
    setError(null);

    const result =
      mode === "sign-up"
        ? await authClient.signUp.email({
            email,
            password,
            name: String(form.get("name")),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          })
        : await authClient.signIn.email({ email, password });

    setPending(false);
    if (result.error) {
      setError(result.error.message ?? "Could not sign you in");
      return;
    }
    router.push(next);
    router.refresh();
  }

  async function signInWithGoogle() {
    await authClient.signIn.social({ provider: "google", callbackURL: next });
  }

  const isSignUp = mode === "sign-up";

  return (
    <Card className="paper-grid w-full max-w-sm shadow-lg shadow-primary/10">
      <CardHeader>
        <CardTitle className="font-display text-2xl">{isSignUp ? "Create your notebook" : "Welcome back"}</CardTitle>
        <CardDescription>
          {isSignUp ? "Start planning your weeks." : "Sign in to open your weekly planner."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={onSubmit} className="space-y-4">
          {isSignUp && (
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" autoComplete="name" required maxLength={100} />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete={isSignUp ? "new-password" : "current-password"}
              minLength={10}
              required
            />
            {isSignUp && <p className="text-xs text-muted-foreground">At least 10 characters.</p>}
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Please wait…" : isSignUp ? "Create account" : "Sign in"}
          </Button>
        </form>
        {googleEnabled && (
          <>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <Separator className="flex-1" /> or <Separator className="flex-1" />
            </div>
            <Button variant="outline" className="w-full" onClick={signInWithGoogle}>
              Continue with Google
            </Button>
          </>
        )}
      </CardContent>
      <CardFooter className="text-sm text-muted-foreground">
        {isSignUp ? (
          <span>
            Already have an account?{" "}
            <Link className="text-foreground underline underline-offset-4" href="/sign-in">
              Sign in
            </Link>
          </span>
        ) : (
          <span>
            New here?{" "}
            <Link className="text-foreground underline underline-offset-4" href="/sign-up">
              Create an account
            </Link>
          </span>
        )}
      </CardFooter>
    </Card>
  );
}
