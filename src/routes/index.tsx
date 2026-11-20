import { createFileRoute } from "@tanstack/react-router";
import { GlowBoard } from "@/components/glow-board";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Glow Progress Board" },
      { name: "description", content: "Track goals with progress bars, notes and background pictures." },
      { property: "og:title", content: "Glow Progress Board" },
      { property: "og:description", content: "Track goals with progress bars, notes and background pictures." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  // Saves live on this device, so the board loads its last-used slot once the page is open.
  component: function Index() { return <GlowBoard />; },
});
