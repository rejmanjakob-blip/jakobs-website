import { z } from "zod";

/**
 * Automatic "uncheck everything" schedules for note checklists and checkbox progress boxes.
 * Times are the device's local time. `last` is when the box was last reset (or when the schedule
 * was set), so a reset happens once per scheduled moment no matter how many devices are open.
 */
export const resetSchema = z.object({
  every: z.enum(["day", "week", "30days"]),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  weekday: z.number().int().min(0).max(6).optional(), // 0 = Sunday
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), // first day of the 30-day cycle
  last: z.string(),
});
export type ResetSchedule = z.infer<typeof resetSchema>;

const DAY_MS = 24 * 60 * 60 * 1000;
const at = (date: Date, time: string, addDays = 0) => {
  const [h, m] = time.split(":").map(Number);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + addDays, h ?? 0, m ?? 0, 0, 0);
};
const parseDay = (day: string) => { const [y, m, d] = day.split("-").map(Number); return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1); };

/** The most recent scheduled reset moment at or before `now` (null if the 30-day cycle hasn't started). */
export function lastOccurrence(s: ResetSchedule, now: Date): Date | null {
  if (s.every === "day") {
    const today = at(now, s.time);
    return today <= now ? today : at(now, s.time, -1);
  }
  if (s.every === "week") {
    const weekday = s.weekday ?? 1;
    const back = (now.getDay() - weekday + 7) % 7;
    const candidate = at(now, s.time, -back);
    return candidate <= now ? candidate : at(now, s.time, -back - 7);
  }
  const first = at(parseDay(s.start ?? toDay(now)), s.time);
  if (now < first) return null;
  // Count whole calendar days (not milliseconds) so clock changes never shift the cycle.
  const days = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - parseDay(s.start ?? toDay(now)).getTime()) / DAY_MS);
  let cycles = Math.floor(days / 30);
  let candidate = at(first, s.time, cycles * 30);
  if (candidate > now) { cycles -= 1; candidate = at(first, s.time, cycles * 30); }
  return cycles < 0 ? null : candidate;
}

/** The next scheduled reset moment after `now`. */
export function nextOccurrence(s: ResetSchedule, now: Date): Date {
  if (s.every === "day") { const today = at(now, s.time); return today > now ? today : at(now, s.time, 1); }
  if (s.every === "week") {
    const ahead = ((s.weekday ?? 1) - now.getDay() + 7) % 7;
    const candidate = at(now, s.time, ahead);
    return candidate > now ? candidate : at(now, s.time, ahead + 7);
  }
  const previous = lastOccurrence(s, now);
  return previous ? at(previous, s.time, 30) : at(parseDay(s.start ?? toDay(now)), s.time);
}

export const isDue = (s: ResetSchedule, now: Date) => {
  const previous = lastOccurrence(s, now);
  return previous !== null && new Date(s.last) < previous;
};

export function toDay(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Turns every checked checklist line (■ or ☑) back into an empty box (☐). */
export const uncheckText = (text: string) => text.replace(/^(■|☑) /gm, "☐ ");
