import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/app/auth-form";
import { googleEnabled } from "@/server/auth";

export const metadata: Metadata = { title: "Create account" };

export default function SignUpPage() {
  return (
    <Suspense>
      <AuthForm mode="sign-up" googleEnabled={googleEnabled()} />
    </Suspense>
  );
}
