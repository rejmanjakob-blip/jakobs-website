import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { nextOccurrence, toDay, type ResetSchedule } from "@/lib/reset-schedule";

type Every = "off" | ResetSchedule["every"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const CHOICES: [Every, string][] = [["off", "Off"], ["day", "Every day"], ["week", "Every 7 days"], ["30days", "Every 30 days"]];

const describe = (s: ResetSchedule) => {
  const time = new Date(`2000-01-01T${s.time}`).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (s.every === "day") return `Unchecks every day at ${time}`;
  if (s.every === "week") return `Unchecks every ${WEEKDAYS[s.weekday ?? 1]} at ${time}`;
  return `Unchecks every 30 days at ${time}`;
};

/**
 * Small round button on a box's top-right corner. It opens a panel to uncheck the box's ticks
 * automatically every day, every 7 days (chosen weekday) or every 30 days (from a chosen date).
 */
export function ResetScheduleButton({ value, label, onChange }: { value: ResetSchedule | undefined; label: string; onChange: (reset: ResetSchedule | undefined) => void }) {
  const [open, setOpen] = useState(false);
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return <>
    <button type="button" className="reset-button" data-active={value ? "" : undefined}
      aria-label={`${label}: automatic unchecking${value ? ` (${describe(value)})` : ""}`} title={value ? describe(value) : "Uncheck boxes automatically"}
      onPointerDown={stop} onPointerUp={stop} onClick={e => { stop(e); setOpen(true); }}>
      <RotateCcw aria-hidden="true" />
    </button>
    {open && typeof document !== "undefined" && createPortal(<ResetDialog value={value} label={label} onClose={() => setOpen(false)} onSave={reset => { onChange(reset); setOpen(false); }} />, document.body)}
  </>;
}

function ResetDialog({ value, label, onClose, onSave }: { value: ResetSchedule | undefined; label: string; onClose: () => void; onSave: (reset: ResetSchedule | undefined) => void }) {
  const today = new Date();
  const [every, setEvery] = useState<Every>(value?.every ?? "day");
  const [time, setTime] = useState(value?.time ?? "06:00");
  const [weekday, setWeekday] = useState(value?.weekday ?? today.getDay());
  const [start, setStart] = useState(value?.start ?? toDay(today));
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);
  const draft: ResetSchedule | undefined = every === "off" ? undefined : {
    every, time: time || "06:00", last: new Date().toISOString(),
    ...(every === "week" ? { weekday } : {}), ...(every === "30days" ? { start } : {}),
  };
  const next = draft ? nextOccurrence(draft, new Date()) : null;
  return <div className="reset-backdrop" data-no-subtab-prompt onPointerDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div role="dialog" aria-modal="true" aria-labelledby="reset-title" className="reset-dialog glow-box">
      <h2 id="reset-title">Uncheck automatically</h2>
      <p className="reset-sub">{label}</p>
      <div role="radiogroup" aria-label="How often" className="reset-choices">
        {CHOICES.map(([key, text]) => <button key={key} type="button" role="radio" aria-checked={every === key} className="reset-choice" onClick={() => setEvery(key)}>{text}</button>)}
      </div>
      {every === "week" && <label className="reset-field"><span>On</span>
        <select value={weekday} onChange={e => setWeekday(Number(e.target.value))}>{WEEKDAYS.map((day, i) => <option key={day} value={i}>{day}</option>)}</select>
      </label>}
      {every === "30days" && <label className="reset-field"><span>Starting</span>
        <input type="date" value={start} onChange={e => setStart(e.target.value || toDay(today))} />
      </label>}
      {every !== "off" && <label className="reset-field"><span>At</span>
        <input type="time" value={time} onChange={e => setTime(e.target.value)} />
      </label>}
      <p className="reset-next" aria-live="polite">{next ? `Next reset: ${next.toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : "Checked boxes stay as they are."}</p>
      <div className="reset-actions">
        <Button variant="outline" className="glow-button h-8 px-3 text-xs" onClick={onClose}>Cancel</Button>
        <Button variant="outline" className="glow-button h-8 px-3 text-xs" onClick={() => onSave(draft)}>Save</Button>
      </div>
    </div>
  </div>;
}
