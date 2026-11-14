"use client";

import { ThemeSwitcher } from "@/components/app/theme-toggle";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function AppearanceCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
        <CardDescription>System follows your device&apos;s light or dark setting.</CardDescription>
      </CardHeader>
      <CardContent>
        <ThemeSwitcher className="sm:max-w-sm" />
      </CardContent>
    </Card>
  );
}
