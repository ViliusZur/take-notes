import type { Metadata } from "next";
import { SettingsView } from "@/components/settings/settings-view";
import { featuresDto } from "@/server/features";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  // Optional features come from environment variables, so they change only on redeploy/restart.
  return <SettingsView features={featuresDto()} />;
}
