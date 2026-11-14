import { LoaderCircle } from "lucide-react";

export function LoadingBlock({ label }: { label: string }) {
  return (
    <div className="flex min-h-[50dvh] items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
      <LoaderCircle className="size-4 animate-spin" aria-hidden />
      {label}
    </div>
  );
}
