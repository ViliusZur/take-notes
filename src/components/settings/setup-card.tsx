import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { FeaturesDto } from "@/lib/api-types";

function Missing({ title, body, vars }: { title: string; body: string; vars: string[] }) {
  return (
    <div className="space-y-1.5">
      <h3 className="text-sm font-medium">{title}</h3>
      <p className="text-sm text-muted-foreground">{body}</p>
      <p className="flex flex-wrap gap-1.5">
        {vars.map((name) => (
          <code key={name} className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
            {name}
          </code>
        ))}
      </p>
    </div>
  );
}

/** Explains which optional features are off and which environment variables turn them on. */
export function SetupCard({ features }: { features: FeaturesDto }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Optional features</CardTitle>
        <CardDescription>
          The planner works without these. Set the environment variables below and restart or redeploy the app to
          turn them on. The README has a step-by-step guide.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 pt-5">
        {!features.email && (
          <Missing
            title="Email reminders are off"
            body="Weekly planning reminders and call follow-ups by email."
            vars={features.missing.email}
          />
        )}
        {!features.calls && (
          <Missing
            title="Planning calls are off"
            body="The Sunday AI call that drafts your week. For a demo without Vapi or Twilio, set VOICE_PROVIDER=simulated and ANTHROPIC_API_KEY."
            vars={features.missing.calls}
          />
        )}
      </CardContent>
    </Card>
  );
}
