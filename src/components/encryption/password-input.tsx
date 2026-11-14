"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** A password field with an eye button that shows or hides what's typed. */
export function PasswordInput({ className, disabled, ...props }: Omit<ComponentProps<typeof Input>, "type">) {
  const [visible, setVisible] = useState(false);
  const label = visible ? "Hide password" : "Show password";

  return (
    <div className="relative min-w-0 flex-1">
      <Input
        {...props}
        type={visible ? "text" : "password"}
        disabled={disabled}
        // Shown as text, a password must not go to spell-check services or be auto-corrected.
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        className={cn("pr-10", className)}
      />
      <button
        type="button"
        onClick={() => setVisible((shown) => !shown)}
        disabled={disabled}
        aria-label={label}
        aria-pressed={visible}
        title={label}
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
      >
        {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
      </button>
    </div>
  );
}
