/**
 * Minimal Upstash Redis REST client (server only). Vercel's Upstash integration adds
 * KV_REST_API_URL / KV_REST_API_TOKEN (older setups: UPSTASH_REDIS_REST_URL / _TOKEN).
 */
type Command = (string | number)[];

function config() {
  const url = process.env["KV_REST_API_URL"] ?? process.env["UPSTASH_REDIS_REST_URL"];
  const token = process.env["KV_REST_API_TOKEN"] ?? process.env["UPSTASH_REDIS_REST_TOKEN"];
  return url && token ? { url: url.replace(/\/+$/, ""), token } : null;
}

export const cloudConfigured = () => config() !== null;

async function call<T>(path: string, body: unknown): Promise<T> {
  const c = config();
  if (!c) throw new Error("Cloud saving is not set up.");
  const res = await fetch(c.url + path, { method: "POST", headers: { Authorization: `Bearer ${c.token}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => null) as unknown;
  if (!res.ok) throw new Error(`Cloud storage error (${res.status}).`);
  return data as T;
}

export async function redis<T = unknown>(command: Command): Promise<T> {
  const data = await call<{ result?: T; error?: string }>("", command);
  if (data.error) throw new Error(data.error);
  return data.result as T;
}

export async function pipeline<T = unknown>(commands: Command[]): Promise<T[]> {
  if (!commands.length) return [];
  const data = await call<{ result?: T; error?: string }[]>("/pipeline", commands);
  return data.map(entry => { if (entry.error) throw new Error(entry.error); return entry.result as T; });
}
