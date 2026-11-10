import { useCallback, useEffect, useRef, useState } from "react";

/** Reveals `text` character by character at `charsPerSecond` (0 = instantly).
 * `finish()` shows the rest at once - the first tap on a line still being typed. */
export function useTypewriter(text: string, charsPerSecond: number, key: string) {
  const [shown, setShown] = useState(charsPerSecond <= 0 ? text.length : 0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };

  useEffect(() => {
    stop();
    if (charsPerSecond <= 0 || text.length === 0) {
      setShown(text.length);
      return;
    }
    setShown(0);
    // Tick at ~30fps and reveal several characters per tick at high speeds, instead of
    // scheduling one timer per character.
    const tickMs = 33;
    const perTick = Math.max(1, Math.round((charsPerSecond * tickMs) / 1000));
    timer.current = setInterval(() => {
      setShown((current) => {
        const next = Math.min(text.length, current + perTick);
        if (next >= text.length) stop();
        return next;
      });
    }, tickMs);
    return stop;
    // `key` restarts the effect for a new line even if its text happens to be identical.
  }, [key, text, charsPerSecond]);

  const finish = useCallback(() => {
    stop();
    setShown(text.length);
  }, [text]);

  return { visibleText: text.slice(0, shown), done: shown >= text.length, finish };
}
