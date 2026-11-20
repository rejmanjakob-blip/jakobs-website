import { createReadStream } from "node:fs";
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { defineConfig, type Plugin, type PluginOption } from "vite";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";

export default defineConfig(async ({ command }) => {
  const plugins: PluginOption[] = [
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    tanstackStart({ server: { entry: "server" } }),
  ];
  if (command === "build") {
    // Nitro picks the right output for the host (Vercel, Node, ...) automatically.
    const { nitro } = await import("nitro/vite");
    plugins.push(nitro());
  }
  plugins.push(viteReact(), localSaves());
  return {
    plugins,
    resolve: {
      alias: { "@": path.resolve(process.cwd(), "src") },
      dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
    },
    server: { port: 8080 },
  };
});

/**
 * Local saving while the site runs on this computer (`bun run dev`).
 * Whole-board save slots are written to `saves/slot-N.json` and uploaded videos to
 * `saves/videos/` inside the project folder. The deployed site has no such server,
 * so the app falls back to browser storage there (see src/lib/local-saves.ts).
 */
function localSaves(): Plugin {
  const SLOT = /^\/slots\/(\d{1,2})$/;
  const VIDEO = /^\/videos\/([a-zA-Z0-9-]{1,80}\.[a-zA-Z0-9]{1,5})$/;
  const MAX_BODY = 512 * 1024 * 1024;
  const VIDEO_TYPES: Record<string, string> = { mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", m4v: "video/x-m4v", ogv: "video/ogg" };
  return {
    name: "local-saves",
    apply: "serve",
    configureServer(server) {
      const dir = path.resolve(server.config.root, "saves");
      const videos = path.join(dir, "videos");
      const slotFile = (slot: number) => path.join(dir, `slot-${slot}.json`);
      const exists = (file: string) => stat(file).then(s => s, () => null);
      const atomicWrite = async (file: string, data: string | Buffer) => {
        await mkdir(path.dirname(file), { recursive: true });
        const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
        await writeFile(tmp, data);
        // Windows refuses to replace a file while it is being read, so retry briefly before giving up.
        for (let attempt = 0; ; attempt++) {
          try { await rename(tmp, file); return; }
          catch (error) {
            if (attempt >= 20) { await unlink(tmp).catch(() => {}); throw error; }
            await new Promise(resolve => setTimeout(resolve, 50));
          }
        }
      };
      const readBody = (req: import("node:http").IncomingMessage) => new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];
        let size = 0;
        req.on("data", (chunk: Buffer) => { size += chunk.length; if (size > MAX_BODY) { reject(new Error("too large")); req.destroy(); } else chunks.push(chunk); });
        req.on("end", () => resolve(Buffer.concat(chunks)));
        req.on("error", reject);
      });

      server.middlewares.use("/__local-saves", (req, res) => {
        const send = (status: number, body: unknown) => { res.statusCode = status; res.setHeader("content-type", "application/json"); res.end(JSON.stringify(body)); };
        // Only this page may use the save server: a custom header forces a CORS preflight that other sites fail.
        const origin = req.headers.origin;
        if (req.headers["x-local-saves"] !== "1" || (origin && new URL(origin).host !== req.headers.host)) return send(403, { error: "forbidden" });
        const url = new URL(req.url ?? "/", "http://local");
        void (async () => {
          try {
            if (url.pathname === "/ping") return send(200, { ok: true, folder: dir });
            if (url.pathname === "/slots" && req.method === "GET") {
              const names = await readdir(dir).catch(() => [] as string[]);
              const slots = [];
              for (const name of names) {
                const match = /^slot-(\d+)\.json$/.exec(name);
                if (!match) continue;
                const info = await stat(path.join(dir, name));
                slots.push({ slot: Number(match[1]), saved_at: info.mtime.toISOString() });
              }
              return send(200, slots.sort((a, b) => a.slot - b.slot));
            }
            const slotMatch = SLOT.exec(url.pathname);
            if (slotMatch) {
              const slot = Number(slotMatch[1]);
              if (slot < 1 || slot > 10) return send(400, { error: "bad slot" });
              if (req.method === "GET") {
                if (!(await exists(slotFile(slot)))) return send(404, { error: "empty" });
                res.setHeader("content-type", "application/json");
                return res.end(await readFile(slotFile(slot)));
              }
              if (req.method === "PUT") {
                const body = await readBody(req);
                JSON.parse(body.toString("utf8"));
                if (url.searchParams.get("overwrite") !== "1" && (await exists(slotFile(slot)))) return send(409, { error: "exists" });
                await atomicWrite(slotFile(slot), body);
                const info = await stat(slotFile(slot));
                return send(200, { slot, saved_at: info.mtime.toISOString() });
              }
            }
            const videoMatch = VIDEO.exec(url.pathname);
            if (videoMatch?.[1]) {
              const file = path.join(videos, videoMatch[1]);
              if (req.method === "GET") {
                const info = await exists(file);
                if (!info) return send(404, { error: "missing" });
                res.setHeader("content-type", VIDEO_TYPES[videoMatch[1].split(".").pop()!.toLowerCase()] ?? "application/octet-stream");
                res.setHeader("content-length", String(info.size));
                return void createReadStream(file).pipe(res);
              }
              if (req.method === "PUT") { await atomicWrite(file, await readBody(req)); return send(200, { ok: true }); }
            }
            send(404, { error: "not found" });
          } catch (error) {
            server.config.logger.error(`[local-saves] ${error instanceof Error ? error.message : String(error)}`);
            send(500, { error: "failed" });
          }
        })();
      });
    },
  };
}
