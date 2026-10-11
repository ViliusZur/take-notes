export function LoadingBlock({ label }: { label: string }) {
  return (
    <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground" role="status">
      {label}
    </div>
  );
}
