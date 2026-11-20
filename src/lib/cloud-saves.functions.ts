import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { boardSchema, slotSchema } from "@/lib/board-state";

/**
 * Cloud save slots shared by every device. Boards are stored without their pictures;
 * each picture is stored once under the SHA-256 of its data URL ("cloud-photo:<hash>").
 *
 * Keys: glow:slot:N (board JSON), glow:slotv:N (version), glow:slott:N (saved_at), glow:photo:<hash>.
 */
const PHOTO_PREFIX = "glow:photo:";
const hashSchema = z.string().regex(/^[0-9a-f]{64}$/);

async function server() {
  const mod = await import("./redis.server");
  if (!mod.cloudConfigured()) throw new Error("Cloud saving is not set up.");
  // On the public site, cloud saves are only reachable behind the site password.
  if (process.env["VERCEL"] && !process.env["SITE_PASSWORD"]) throw new Error("Set SITE_PASSWORD in Vercel to turn on cloud saving.");
  return mod;
}

export const cloudStatus = createServerFn({ method: "GET" }).handler(async () => {
  try { await server(); return { enabled: true, reason: "" }; }
  catch (error) { return { enabled: false, reason: error instanceof Error ? error.message : "" }; }
});

export const cloudList = createServerFn({ method: "GET" }).handler(async () => {
  const { pipeline } = await server();
  const slots = Array.from({ length: 10 }, (_, i) => i + 1);
  const rows = await pipeline<string | null>(slots.flatMap(n => [["GET", `glow:slotv:${n}`], ["GET", `glow:slott:${n}`]]));
  return slots.map((slot, i) => ({ slot, version: Number(rows[i * 2] ?? 0), saved_at: rows[i * 2 + 1] ?? "" })).filter(row => row.version > 0);
});

export const cloudRead = createServerFn({ method: "GET" }).inputValidator(slotSchema).handler(async ({ data: slot }) => {
  const { pipeline } = await server();
  const [json, version] = await pipeline<string | null>([["GET", `glow:slot:${slot}`], ["GET", `glow:slotv:${slot}`]]);
  if (!json) return null;
  // Sent as text; the browser parses it (keeps the server response a plain string).
  return { json, version: Number(version ?? 0) };
});

// Atomic compare-and-set: refuses to overwrite a newer version written by another device.
const WRITE_SCRIPT = `
local cur = tonumber(redis.call('GET', KEYS[2]) or '0')
if ARGV[3] == '0' and cur > 0 then return -2 end
if ARGV[4] ~= '' and tonumber(ARGV[4]) ~= cur then return -1 end
redis.call('SET', KEYS[1], ARGV[1])
redis.call('SET', KEYS[3], ARGV[2])
redis.call('SET', KEYS[2], cur + 1)
return cur + 1`;

export const cloudWrite = createServerFn({ method: "POST" })
  .inputValidator(z.object({ slot: slotSchema, snapshot: boardSchema, overwrite: z.boolean(), baseVersion: z.number().int().min(0).nullable() }))
  .handler(async ({ data }) => {
    const { redis } = await server();
    const saved_at = new Date().toISOString();
    const result = await redis<number>(["EVAL", WRITE_SCRIPT, 3, `glow:slot:${data.slot}`, `glow:slotv:${data.slot}`, `glow:slott:${data.slot}`,
      JSON.stringify(data.snapshot), saved_at, data.overwrite ? "1" : "0", data.baseVersion === null ? "" : String(data.baseVersion)]);
    if (result === -2) return { ok: false as const, reason: "taken" as const };
    if (result === -1) return { ok: false as const, reason: "conflict" as const };
    return { ok: true as const, slot: data.slot, saved_at, version: result };
  });

export const cloudMissingPhotos = createServerFn({ method: "POST" }).inputValidator(z.array(hashSchema).max(500)).handler(async ({ data }) => {
  const { pipeline } = await server();
  const exists = await pipeline<number>(data.map(hash => ["EXISTS", PHOTO_PREFIX + hash]));
  return data.filter((_, i) => !exists[i]);
});

export const cloudPutPhoto = createServerFn({ method: "POST" })
  .inputValidator(z.object({ hash: hashSchema, data: z.string().startsWith("data:image/").max(9_500_000) }))
  .handler(async ({ data }) => {
    const { redis } = await server();
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data.data))), b => b.toString(16).padStart(2, "0")).join("");
    if (digest !== data.hash) throw new Error("Picture upload was damaged; please try again.");
    await redis(["SET", PHOTO_PREFIX + data.hash, data.data, "NX"]);
    return { ok: true };
  });

export const cloudGetPhotos = createServerFn({ method: "POST" }).inputValidator(z.array(hashSchema).max(8)).handler(async ({ data }) => {
  const { pipeline } = await server();
  return pipeline<string | null>(data.map(hash => ["GET", PHOTO_PREFIX + hash]));
});
