# Glow Progress Board

Personal progress dashboards with progress bars, notes, graphs, pictures and videos.

## Run it on this computer

```sh
bun install
bun run dev
```

Then open http://localhost:8080.

## Where your saves live

While the site runs on this computer, every change autosaves to the `saves/` folder in this project
(`saves/slot-1.json` … `saves/slot-10.json`, uploaded videos in `saves/videos/`).
That folder is git-ignored, so it is never pushed to GitHub. Copy it somewhere safe to back up your boards.

The deployed site (for example on Vercel) has no access to this folder, so there the board saves in
that browser on that device instead.

## Built with

TanStack Start, React, TypeScript, Tailwind CSS.
