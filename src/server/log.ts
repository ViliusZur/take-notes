import "server-only";

type Level = "debug" | "info" | "warn" | "error";

const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function threshold(): number {
  const configured = process.env.LOG_LEVEL as Level | undefined;
  if (configured && configured in order) return order[configured];
  return process.env.NODE_ENV === "production" ? order.info : order.debug;
}

function serialize(value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  return value;
}

/**
 * Levels: `info` infrastructure, `debug` business flow, `warn` attention needed,
 * `error` every failure. Never log planner content, transcripts, phone numbers,
 * or verification codes: logs leave the database's access controls.
 */
function write(level: Level, message: string, args: unknown[]) {
  if (order[level] < threshold()) return;
  const line = JSON.stringify({
    level,
    message,
    time: new Date().toISOString(),
    ...(args.length ? { data: args.map(serialize) } : {}),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  debug: (message: string, ...args: unknown[]) => write("debug", message, args),
  info: (message: string, ...args: unknown[]) => write("info", message, args),
  warn: (message: string, ...args: unknown[]) => write("warn", message, args),
  error: (message: string, ...args: unknown[]) => write("error", message, args),
};
