import { useLayoutEffect, useRef } from "react";

const unchecked = "☐ ";
const checked = "■ ";
export function paragraphLine(text: string, caret: number) {
  const start = text.lastIndexOf("\n", Math.max(0, caret) - 1) + 1;
  const next = text.indexOf("\n", caret);
  const end = next < 0 ? text.length : next;
  return { start, end, content: text.slice(start, end) };
}
const isChecklist = (line: string) => line.startsWith(unchecked) || line.startsWith(checked) || line.startsWith("☑ ");

export function startChecklist(text: string, caret: number) {
  const line = paragraphLine(text, caret);
  if (isChecklist(line.content)) return { text, caret };
  return { text: text.slice(0, line.start) + unchecked + text.slice(line.start), caret: caret + unchecked.length };
}

export function checklistEnter(text: string, start: number, end: number, consecutive: boolean) {
  const line = paragraphLine(text, start);
  if (!isChecklist(line.content)) return null;
  if (consecutive && !line.content.slice(2).trim()) {
    return { text: text.slice(0, line.start) + text.slice(line.end), caret: line.start };
  }
  const caret = Math.max(line.start + 2, start);
  return { text: text.slice(0, caret) + "\n" + unchecked + text.slice(Math.max(caret, end)), caret: caret + 3 };
}

export function ChecklistParagraph({ value, onChange, label, className, style }: { value: string; onChange: (value: string) => void; label: string; className: string; style?: React.CSSProperties }) {
  const input = useRef<HTMLTextAreaElement>(null);
  const pendingCaret = useRef<number | null>(null);
  const lastEnter = useRef(false);
  const taps = useRef<{ line: number; times: number[] } | null>(null);
  const apply = (change: { text: string; caret: number }) => {
    pendingCaret.current = change.caret;
    onChange(change.text);
  };
  useLayoutEffect(() => {
    if (pendingCaret.current === null || !input.current) return;
    input.current.setSelectionRange(pendingCaret.current, pendingCaret.current);
    pendingCaret.current = null;
  }, [value]);
  const enter = () => {
    const element = input.current;
    if (!element) return false;
    const change = checklistEnter(value, element.selectionStart, element.selectionEnd, lastEnter.current);
    lastEnter.current = Boolean(change);
    taps.current = null;
    if (!change) return false;
    apply(change);
    return true;
  };
  return <textarea ref={input} value={value} aria-label={label} placeholder="Write a paragraph…" className={className} style={style}
    onChange={event => { lastEnter.current = false; taps.current = null; onChange(event.target.value); }}
    onClick={event => {
      const element = event.currentTarget;
      const caret = element.selectionStart;
      const line = paragraphLine(value, caret);
      const now = event.timeStamp;
      const times = taps.current?.line === line.start ? taps.current.times.filter(time => now - time < 2000) : [];
      times.push(now);
      if (times.length === 3) {
        apply(startChecklist(value, caret));
        lastEnter.current = false;
        taps.current = null;
      } else {
        taps.current = { line: line.start, times };
        if (times.length === 1 && element.selectionStart === element.selectionEnd && caret <= line.start + 1 && isChecklist(line.content)) {
          apply({ text: value.slice(0, line.start) + (line.content.startsWith(unchecked) ? checked : unchecked) + value.slice(line.start + 2), caret });
        }
      }
    }}
    onKeyDown={event => {
      if (event.nativeEvent.isComposing) return;
      if (event.key === "Enter" && !event.shiftKey) { if (enter()) event.preventDefault(); }
      else { lastEnter.current = false; }
    }}
    onBeforeInput={event => {
      const native = event.nativeEvent as InputEvent;
      if (!native.isComposing && (native.inputType === "insertLineBreak" || native.inputType === "insertParagraph")) {
        if (enter()) event.preventDefault();
      }
    }}
  />;
}