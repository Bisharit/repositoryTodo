import "./DurationField.css";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type DurationFieldSize = "compact" | "comfortable";

const WHEEL_ITEM_PX = 44;
const WHEEL_PAD_ITEMS = 2;
const DURATION_STEP = 5;
const DURATION_MAX = 240;

function durationOptions(): number[] {
  const out: number[] = [];
  for (let m = DURATION_STEP; m <= DURATION_MAX; m += DURATION_STEP) out.push(m);
  return out;
}

const ALL_MINUTES = durationOptions();

export function formatDurationMinutes(min: number): string {
  if (min <= 0) return "";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} мин`;
  if (m === 0) return `${h} ч`;
  return `${h} ч ${m} мин`;
}

function snapDuration(value: number): number {
  const clamped = Math.max(DURATION_STEP, Math.min(DURATION_MAX, value));
  const snapped = Math.round(clamped / DURATION_STEP) * DURATION_STEP;
  return Math.max(DURATION_STEP, Math.min(DURATION_MAX, snapped));
}

type DurationPickerModalProps = {
  ariaLabel: string;
  allowEmpty: boolean;
  initialMinutes: number | undefined;
  onConfirm: (minutes: number | undefined) => void;
  onClose: () => void;
};

function DurationWheel({
  minutes,
  onChange,
}: {
  minutes: number;
  onChange: (m: number) => void;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  const scrollRaf = useRef<number | null>(null);
  const selectedIndex = Math.max(0, ALL_MINUTES.indexOf(minutes));

  const scrollToIndex = useCallback((index: number, smooth: boolean) => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: index * WHEEL_ITEM_PX, behavior: smooth ? "smooth" : "auto" });
  }, []);

  useLayoutEffect(() => {
    scrollToIndex(selectedIndex >= 0 ? selectedIndex : 0, false);
  }, [selectedIndex, scrollToIndex]);

  const handleScroll = () => {
    if (scrollRaf.current !== null) cancelAnimationFrame(scrollRaf.current);
    scrollRaf.current = requestAnimationFrame(() => {
      const el = listRef.current;
      if (!el) return;
      const index = Math.round(el.scrollTop / WHEEL_ITEM_PX);
      const clamped = Math.max(0, Math.min(ALL_MINUTES.length - 1, index));
      const v = ALL_MINUTES[clamped];
      if (v !== undefined && v !== minutes) onChange(v);
    });
  };

  return (
    <div className="duration-wheel" aria-label="Минуты">
      <ul ref={listRef} className="duration-wheel__list" onScroll={handleScroll}>
        {Array.from({ length: WHEEL_PAD_ITEMS }, (_, i) => (
          <li key={`pad-top-${i}`} className="duration-wheel__pad" aria-hidden />
        ))}
        {ALL_MINUTES.map((v) => (
          <li key={v} role="presentation">
            <button
              type="button"
              className={`duration-wheel__item${v === minutes ? " duration-wheel__item--active" : ""}`}
              onClick={() => {
                onChange(v);
                scrollToIndex(ALL_MINUTES.indexOf(v), true);
              }}
            >
              {formatDurationMinutes(v)}
            </button>
          </li>
        ))}
        {Array.from({ length: WHEEL_PAD_ITEMS }, (_, i) => (
          <li key={`pad-bot-${i}`} className="duration-wheel__pad" aria-hidden />
        ))}
      </ul>
      <div className="duration-wheel__frame" aria-hidden />
    </div>
  );
}

function DurationPickerModal({
  ariaLabel,
  allowEmpty,
  initialMinutes,
  onConfirm,
  onClose,
}: DurationPickerModalProps) {
  const titleId = useId();
  const inputId = useId();
  const [draft, setDraft] = useState(initialMinutes ?? 15);
  const [text, setText] = useState(initialMinutes ? String(initialMinutes) : "");

  const commit = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) {
      if (allowEmpty) {
        onConfirm(undefined);
        onClose();
        return;
      }
      onConfirm(draft);
      onClose();
      return;
    }
    const n = Number(trimmed.replace(/\D/g, ""));
    if (!Number.isFinite(n) || n <= 0) {
      onConfirm(draft);
      onClose();
      return;
    }
    onConfirm(snapDuration(n));
    onClose();
  }, [text, allowEmpty, onConfirm, onClose, draft]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "Enter") commit();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose, commit]);

  return createPortal(
    <div className="duration-picker-sheet" role="presentation">
      <button type="button" className="duration-picker-sheet__backdrop" aria-label="Закрыть" onClick={onClose} />
      <div className="duration-picker-sheet__panel" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="duration-picker-sheet__header">
          <h3 className="duration-picker-sheet__title" id={titleId}>
            {ariaLabel}
          </h3>
          <button type="button" className="duration-picker-sheet__close" aria-label="Закрыть" onClick={onClose}>
            ✕
          </button>
        </header>

        <label className="duration-picker-sheet__input-wrap" htmlFor={inputId}>
          <span className="duration-picker-sheet__input-label">Ввести минуты</span>
          <input
            id={inputId}
            type="text"
            className="duration-picker-sheet__input"
            inputMode="numeric"
            placeholder="15"
            value={text}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "").slice(0, 3);
              setText(v);
              const n = Number(v);
              if (Number.isFinite(n) && n > 0) setDraft(snapDuration(n));
            }}
          />
          <span className="duration-picker-sheet__input-suffix">мин</span>
        </label>

        <DurationWheel
          minutes={draft}
          onChange={(m) => {
            setDraft(m);
            setText(String(m));
          }}
        />

        <footer className="duration-picker-sheet__footer">
          {allowEmpty ? (
            <button
              type="button"
              className="duration-picker-sheet__btn duration-picker-sheet__btn--ghost"
              onClick={() => {
                onConfirm(undefined);
                onClose();
              }}
            >
              Очистить
            </button>
          ) : (
            <span />
          )}
          <button type="button" className="duration-picker-sheet__btn duration-picker-sheet__btn--primary" onClick={commit}>
            Готово
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

type DurationFieldProps = {
  value: number | undefined;
  onChange: (minutes: number | undefined) => void;
  "aria-label": string;
  disabled?: boolean;
  allowEmpty?: boolean;
  size?: DurationFieldSize;
};

export function DurationField({
  value,
  onChange,
  "aria-label": ariaLabel,
  disabled = false,
  allowEmpty = true,
  size = "comfortable",
}: DurationFieldProps) {
  const [open, setOpen] = useState(false);
  const label = value ? formatDurationMinutes(value) : "—";

  return (
    <>
      <button
        type="button"
        className={`duration-field duration-field--${size}`}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        {label}
      </button>
      {open ? (
        <DurationPickerModal
          ariaLabel={ariaLabel}
          allowEmpty={allowEmpty}
          initialMinutes={value}
          onConfirm={onChange}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
