declare const process: { env: { NODE_ENV?: string } } | undefined;

const seen = new Set<string>();

/** Logs a development-only warning, once per message. */
export function warn(message: string): void {
  if (typeof process === 'undefined' || process.env.NODE_ENV === 'production') return;
  if (seen.has(message)) return;
  seen.add(message);
  console.error(`[splittext-react] ${message}`);
}
