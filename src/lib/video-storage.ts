import { useEffect, useState } from "react";
import { getVideo, putVideo } from "@/lib/local-saves";

const PREFIX = "local/";

/** Stores a video file on this device and returns the path kept in the board instead of the file. */
export async function uploadVideo(file: File) {
  const ext = (file.name.split(".").pop() || "mp4").replace(/[^a-zA-Z0-9]/g, "").slice(0, 5) || "mp4";
  const name = `${crypto.randomUUID()}.${ext}`;
  await putVideo(name, file);
  return PREFIX + name;
}

const cache = new Map<string, Promise<string | null>>();
/** Resolves a stored video path to a playable URL; null while loading or when the video is not on this device. */
export function useVideoUrl(path: string) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    if (!path.startsWith(PREFIX)) { setUrl(null); return; }
    if (!cache.has(path)) cache.set(path, getVideo(path.slice(PREFIX.length)).then(blob => blob ? URL.createObjectURL(blob) : null).catch(() => null));
    void cache.get(path)?.then(u => { if (live) setUrl(u); });
    return () => { live = false; };
  }, [path]);
  return url;
}
