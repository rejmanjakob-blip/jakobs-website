# Glow Progress Board

Personal progress dashboards with progress bars, notes, graphs, pictures and videos.

## Run it on this computer

```sh
bun install
bun run dev
```

Then open http://localhost:8080.

## Where your saves live

**Cloud (recommended):** when the site has an Upstash Redis database connected (Vercel → Storage) and a
`SITE_PASSWORD` set, every device — phone, laptop, and this computer — shares the same 10 save slots.
Each picture is stored once; boards only reference it. If two devices edit the same slot, the second one is
asked whether to load the latest or keep its own. Videos stay on the device that added them.

While running on this computer with `.env.local` holding the same keys (`bunx vercel env pull .env.local`),
edits save to the cloud and a backup copy is written to the git-ignored `saves/` folder.

**Without the cloud:** on this computer saves are files in `saves/`; on the deployed site they stay in that browser.

## Password

Set `SITE_PASSWORD` in Vercel → Settings → Environment Variables and redeploy. The browser then asks for it
before showing anything. Cloud saving refuses to run on the public site until a password is set.

## Built with

TanStack Start, React, TypeScript, Tailwind CSS.
