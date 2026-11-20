# Project notes for coding agents

Glow Progress Board: a TanStack Start + React app. Run it with `bun run dev` (port 8080); tests with `bun run test`.
Saves and uploaded videos live on the user's computer in `saves/` (git-ignored), not in any cloud service.

## Rules

- Keep photo editing in a dedicated background-photo module; render photos beneath opaque dashboard controls so movement and formatting never cover text or inputs.
- Keep main and mini note groups unframed with shared proportional width calculations, wrapping the mini group above-left on narrow screens to preserve the original four-note row.
- Keep dashboard tabs mounted with independent state in the glow-board module; collect all home and dashboard content into explicit snapshots for save and restore.
- Keep home photo state mounted alongside dashboard state and reuse the photo module's insertion and pointer gestures so every screen has the same editing behavior.
- Share checklist-aware paragraph editing between main and mini notes, encoding checkbox lines in note text so snapshots retain completion.
- Store whole-board snapshots through src/lib/local-saves.ts: Upstash Redis cloud slots (pictures content-addressed, version compare-and-set, SITE_PASSWORD required on Vercel) when configured; otherwise the git-ignored `saves/` folder via the dev-server plugin, or browser IndexedDB on deployed builds.
- Keep editable graphs in a dedicated bar-graph module and dashboard snapshots, defaulting missing graph arrays to empty so earlier saves remain compatible.
- Store at most seven child dashboard contents under each parent and keep them mounted through the shared dashboard renderer; snapshot defaults preserve older saves and independent child edits.
- Keep home zoom and background panning in the board snapshot as view-only transforms, moving the moon and photos together and scaling photo gesture deltas inversely to retain stored coordinates.
- Serialize manual and automatic slot writes through the board persistence hook, and never autosave over a slot that failed to load.
- Reorder tabs through board-state helpers and axis-specific pointer gestures so saved array order and active content remain aligned; movement cancels the subtab deletion hold.
- Keep dashboard pan/zoom in DashboardView with a per-dashboard view in snapshots; inserted progress and paragraph boxes live in floating-boxes and divide gesture deltas by zoom so stored coordinates stay stable.
- Original dashboard bars/paragraphs are a movable floating-box template; only items[0] stays fixed as the anchor for the insert buttons, and the schema migrates older 4+3 saves into floating boxes.
- Generate new dashboard templates separately from legacy snapshot migration so new defaults never rename or reposition saved content.
- Share metric editing between anchor and floating boxes, persisting optional box-mode fields in snapshots so older saves remain compatible.
- Floating boxes keep plain outer move/corner-resize; an optional textScale, set by the inner-area corner grip, scales only the inner content (note font size, progress content zoom).
- Checkbox metric boxes keep a rigid single-line title and a digit-fitted total, with resize floors measured from the heading; clipping the square area never changes completion data.
