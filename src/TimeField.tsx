import "./TimeField.css";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { parseScheduleTimeInput } from "./plannerDaySchedule";

export type TimeFieldSize = "compact" | "comfortable";

const WHEEL_ITEM_PX = 44;
const WHEEL_PAD_ITEMS = 2;

type TimeFieldProps = {
  value: string;
  onChange: (value: string) => void;
  "aria-label": string;
  disabled?: boolean;
  readOnly?: boolean;
  allowEmpty?: boolean;
  minuteStep?: 5 | 15 | 60;
  minMinutes?: number;
  maxMinutes?: number;
  size?: TimeFieldSize;
  className?: string;
  id?: string;
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatTimeValue(h: number, m: number): string {
  return `${pad2(h)}:${pad2(m)}`;
}

function partsFromValue(value: string): { h: number; m: number } | null {
  const min = parseScheduleTimeInput(value);
  if (min === null) return null;
  return { h: Math.floor(min / 60), m: min % 60 };
}

function minuteOptions(step: 5 | 15 | 60): number[] {
  if (step === 60) return [0];
  const out: number[] = [];
  for (let m = 0; m < 60; m += step) out.push(m);
  return out;
}

function isInRange(total: number, minMinutes?: number, maxMinutes?: number): boolean {
  if (minMinutes !== undefined && total < minMinutes) return false;
  if (maxMinutes !== undefined && total > maxMinutes) return false;
  return true;
}

function validMinutesForHour(
  hour: number,
  step: 5 | 15 | 60,
  minMinutes?: number,
  maxMinutes?: number,
): number[] {
  return minuteOptions(step).filter((m) => isInRange(hour * 60 + m, minMinutes, maxMinutes));
}

function validHours(step: 5 | 15 | 60, minMinutes?: number, maxMinutes?: number): number[] {
  const hours: number[] = [];
  for (let h = 0; h < 24; h++) {
    if (validMinutesForHour(h, step, minMinutes, maxMinutes).length > 0) hours.push(h);
  }
  return hours;
}

function snapToRange(
  h: number,
  m: number,
  step: 5 | 15 | 60,
  minMinutes?: number,
  maxMinutes?: number,
): { h: number; m: number } {
  const mins = validMinutesForHour(h, step, minMinutes, maxMinutes);
  if (mins.length === 0) {
    const hours = validHours(step, minMinutes, maxMinutes);
    const fallbackH = hours[0] ?? 0;
    const fallbackM = validMinutesForHour(fallbackH, step, minMinutes, maxMinutes)[0] ?? 0;
    return { h: fallbackH, m: fallbackM };
  }
  const snapped = mins.reduce((best, cur) => (Math.abs(cur - m) < Math.abs(best - m) ? cur : best), mins[0]);
  return { h, m: snapped };
}

function partsFromMinutes(total: number): { h: number; m: number } {
  return { h: Math.floor(total / 60), m: total % 60 };
}

const MASK_DIGITS_MAX = 4;

function valueToDigits(value: string): string {
  const p = partsFromValue(value);
  if (!p) return "";
  return `${pad2(p.h)}${pad2(p.m)}`;
}

/** Четыре цифры → строка ЧЧ:ММ (двоеточие всегда на месте). */
function digitsToMask(digits: string): string {
  const padded = (digits.replace(/\D/g, "") + "0000").slice(0, MASK_DIGITS_MAX);
  return `${padded[0]}${padded[1]}:${padded[2]}${padded[3]}`;
}

function maskToDigits(mask: string): string {
  return mask.replace(/\D/g, "").slice(0, MASK_DIGITS_MAX);
}

function tryParseDigits(digits: string): { h: number; m: number } | null {
  const d = digits.replace(/\D/g, "");
  if (!d.length) return null;
  const padded = (d + "0000").slice(0, MASK_DIGITS_MAX);
  const h = Number(padded.slice(0, 2));
  const m = Number(padded.slice(2, 4));
  if (!Number.isFinite(h) || !Number.isFinite(m) || h > 23 || m > 59) return null;
  return { h, m };
}

function cursorPosForDigits(len: number): number {
  if (len <= 0) return 0;
  if (len <= 2) return len;
  return len + 1;
}

type MaskedTimeInputProps = {
  id: string;
  digits: string;
  onDigitsChange: (digits: string) => void;
};

/** Поле ЧЧ:ММ — только цифры, двоеточие нельзя стереть. */
function MaskedTimeInput({ id, digits, onDigitsChange }: MaskedTimeInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const display = digitsToMask(digits);

  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el || document.activeElement !== el) return;
    const pos = cursorPosForDigits(digits.length);
    el.setSelectionRange(pos, pos);
  }, [digits, display]);

  const applyDigits = (next: string) => {
    const clean = next.replace(/\D/g, "").slice(0, MASK_DIGITS_MAX);
    onDigitsChange(clean);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Tab" || e.key === "Enter" || e.key.startsWith("Arrow") || e.ctrlKey || e.metaKey) {
      return;
    }

    if (e.key === "Backspace") {
      e.preventDefault();
      applyDigits(digits.slice(0, -1));
      return;
    }

    if (e.key === "Delete") {
      e.preventDefault();
      applyDigits("");
      return;
    }

    if (/^\d$/.test(e.key)) {
      e.preventDefault();
      if (digits.length >= MASK_DIGITS_MAX) return;
      applyDigits(digits + e.key);
      return;
    }

    if (e.key.length === 1) {
      e.preventDefault();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    applyDigits(maskToDigits(e.target.value));
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    applyDigits(e.clipboardData.getData("text"));
  };

  const handleFocus = () => {
    const el = inputRef.current;
    if (!el) return;
    const pos = cursorPosForDigits(digits.length);
    el.setSelectionRange(pos, pos);
  };

  const handleSelect = () => {
    const el = inputRef.current;
    if (!el) return;
    const pos = cursorPosForDigits(digits.length);
    window.requestAnimationFrame(() => {
      if (document.activeElement === el) {
        el.setSelectionRange(pos, pos);
      }
    });
  };

  return (
    <input
      ref={inputRef}
      id={id}
      type="text"
      className="time-picker-sheet__input"
      inputMode="numeric"
      autoComplete="off"
      spellCheck={false}
      maxLength={5}
      placeholder="00:00"
      value={display}
      aria-label="Время, формат ЧЧ:ММ"
      onKeyDown={handleKeyDown}
      onChange={handleChange}
      onPaste={handlePaste}
      onFocus={handleFocus}
      onClick={handleSelect}
    />
  );
}

type ScrollWheelProps = {
  label: string;
  values: number[];
  selected: number;
  onChange: (value: number) => void;
};

function ScrollWheel({ label, values, selected, onChange }: ScrollWheelProps) {
  const listRef = useRef<HTMLUListElement>(null);
  const scrollRaf = useRef<number | null>(null);
  const selectedIndex = Math.max(0, values.indexOf(selected));

  const scrollToIndex = useCallback((index: number, smooth: boolean) => {
    const el = listRef.current;
    if (!el) return;
    const top = index * WHEEL_ITEM_PX;
    el.scrollTo({ top, behavior: smooth ? "smooth" : "auto" });
  }, []);

  useLayoutEffect(() => {
    scrollToIndex(selectedIndex, false);
  }, [selectedIndex, scrollToIndex]);

  const handleScroll = () => {
    if (scrollRaf.current !== null) cancelAnimationFrame(scrollRaf.current);
    scrollRaf.current = requestAnimationFrame(() => {
      const el = listRef.current;
      if (!el) return;
      const index = Math.round(el.scrollTop / WHEEL_ITEM_PX);
      const clamped = Math.max(0, Math.min(values.length - 1, index));
      if (values[clamped] !== undefined && values[clamped] !== selected) {
        onChange(values[clamped]);
      }
    });
  };

  return (
    <div className="time-wheel" aria-label={label}>
      <ul
        ref={listRef}
        className="time-wheel__list"
        onScroll={handleScroll}
        role="listbox"
        aria-label={label}
      >
        {Array.from({ length: WHEEL_PAD_ITEMS }, (_, i) => (
          <li key={`pad-top-${i}`} className="time-wheel__pad" aria-hidden />
        ))}
        {values.map((v) => (
          <li key={v} role="presentation">
            <button
              type="button"
              role="option"
              aria-selected={v === selected}
              className={`time-wheel__item${v === selected ? " time-wheel__item--active" : ""}`}
              onClick={() => {
                onChange(v);
                scrollToIndex(values.indexOf(v), true);
              }}
            >
              {pad2(v)}
            </button>
          </li>
        ))}
        {Array.from({ length: WHEEL_PAD_ITEMS }, (_, i) => (
          <li key={`pad-bot-${i}`} className="time-wheel__pad" aria-hidden />
        ))}
      </ul>
      <div className="time-wheel__frame" aria-hidden />
    </div>
  );
}

type TimePickerModalProps = {
  ariaLabel: string;
  allowEmpty: boolean;
  minuteStep: 5 | 15 | 60;
  minMinutes?: number;
  maxMinutes?: number;
  initialValue: string;
  onConfirm: (value: string) => void;
  onClose: () => void;
};

function TimePickerModal({
  ariaLabel,
  allowEmpty,
  minuteStep,
  minMinutes,
  maxMinutes,
  initialValue,
  onConfirm,
  onClose,
}: TimePickerModalProps) {
  const titleId = useId();
  const inputId = useId();
  const hours = validHours(minuteStep, minMinutes, maxMinutes);

  const initialParts = partsFromValue(initialValue);
  const initialSnapped =
    initialParts !== null
      ? snapToRange(initialParts.h, initialParts.m, minuteStep, minMinutes, maxMinutes)
      : null;

  const [draftH, setDraftH] = useState(initialSnapped?.h ?? hours[0] ?? 0);
  const [draftM, setDraftM] = useState(() => {
    if (initialSnapped) return initialSnapped.m;
    const h0 = hours[0] ?? 0;
    return validMinutesForHour(h0, minuteStep, minMinutes, maxMinutes)[0] ?? 0;
  });
  const [digits, setDigits] = useState(() => valueToDigits(initialValue));

  const minutes = validMinutesForHour(draftH, minuteStep, minMinutes, maxMinutes);

  useEffect(() => {
    if (!minutes.includes(draftM)) {
      setDraftM(minutes[0] ?? 0);
    }
  }, [draftH, minutes, draftM]);

  const syncDigitsFromWheels = useCallback((h: number, m: number) => {
    setDigits(`${pad2(h)}${pad2(m)}`);
  }, []);

  const syncWheelsFromDigits = useCallback(
    (d: string) => {
      const p = tryParseDigits(d);
      if (!p) return;
      const snapped = snapToRange(p.h, p.m, minuteStep, minMinutes, maxMinutes);
      if (!isInRange(snapped.h * 60 + snapped.m, minMinutes, maxMinutes)) return;
      setDraftH(snapped.h);
      setDraftM(snapped.m);
    },
    [minuteStep, minMinutes, maxMinutes],
  );

  const handleHourChange = (h: number) => {
    setDraftH(h);
    const mins = validMinutesForHour(h, minuteStep, minMinutes, maxMinutes);
    const m = mins.includes(draftM) ? draftM : (mins[0] ?? 0);
    setDraftM(m);
    syncDigitsFromWheels(h, m);
  };

  const handleMinuteChange = (m: number) => {
    setDraftM(m);
    syncDigitsFromWheels(draftH, m);
  };

  const handleDigitsChange = (next: string) => {
    setDigits(next);
    syncWheelsFromDigits(next);
  };

  const commitDigits = useCallback((): boolean => {
    if (!digits.length) {
      if (allowEmpty) {
        onConfirm("");
        onClose();
        return true;
      }
      return false;
    }
    const p = tryParseDigits(digits);
    if (!p) return false;
    const snapped = snapToRange(p.h, p.m, minuteStep, minMinutes, maxMinutes);
    if (!isInRange(snapped.h * 60 + snapped.m, minMinutes, maxMinutes)) return false;
    onConfirm(formatTimeValue(snapped.h, snapped.m));
    onClose();
    return true;
  }, [digits, allowEmpty, onConfirm, onClose, minuteStep, minMinutes, maxMinutes]);

  const handleDone = useCallback(() => {
    if (commitDigits()) return;
    onConfirm(formatTimeValue(draftH, draftM));
    onClose();
  }, [commitDigits, onConfirm, onClose, draftH, draftM]);

  const handleClear = () => {
    if (!allowEmpty) return;
    setDigits("");
    onConfirm("");
    onClose();
  };

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "Enter") handleDone();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose, handleDone]);

  return createPortal(
    <div className="time-picker-sheet" role="presentation">
      <button type="button" className="time-picker-sheet__backdrop" aria-label="Закрыть" onClick={onClose} />
      <div className="time-picker-sheet__panel" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="time-picker-sheet__header">
          <h3 className="time-picker-sheet__title" id={titleId}>
            {ariaLabel}
          </h3>
          <button type="button" className="time-picker-sheet__close" aria-label="Закрыть" onClick={onClose}>
            ✕
          </button>
        </header>

        <div className="time-picker-sheet__input-wrap">
          <span className="time-picker-sheet__input-label" id={`${inputId}-label`}>
            Ввести вручную
          </span>
          <MaskedTimeInput id={inputId} digits={digits} onDigitsChange={handleDigitsChange} />
        </div>

        <div className="time-picker-sheet__wheels" aria-hidden={false}>
          <ScrollWheel label="Часы" values={hours} selected={draftH} onChange={handleHourChange} />
          <span className="time-picker-sheet__wheels-sep" aria-hidden>
            :
          </span>
          <ScrollWheel label="Минуты" values={minutes} selected={draftM} onChange={handleMinuteChange} />
        </div>

        <footer className="time-picker-sheet__footer">
          {allowEmpty ? (
            <button type="button" className="time-picker-sheet__btn time-picker-sheet__btn--ghost" onClick={handleClear}>
              Очистить
            </button>
          ) : (
            <span />
          )}
          <button type="button" className="time-picker-sheet__btn time-picker-sheet__btn--primary" onClick={handleDone}>
            Готово
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

export function TimeField({
  value,
  onChange,
  "aria-label": ariaLabel,
  disabled = false,
  readOnly = false,
  allowEmpty = false,
  minuteStep = 60,
  minMinutes,
  maxMinutes,
  size = "comfortable",
  className = "",
  id,
}: TimeFieldProps) {
  const locked = disabled || readOnly;
  const [open, setOpen] = useState(false);

  const parsed = partsFromValue(value);
  const display = parsed !== null ? formatTimeValue(parsed.h, parsed.m) : allowEmpty ? "—:—" : "00:00";

  const rootClass = `time-field time-field--${size}${className ? ` ${className}` : ""}`;

  return (
    <div className={rootClass} role="group" aria-label={ariaLabel} id={id}>
      <button
        type="button"
        className="time-field__trigger"
        disabled={locked}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <span className="time-field__trigger-part">{display.split(":")[0]}</span>
        <span className="time-field__sep" aria-hidden>
          :
        </span>
        <span className="time-field__trigger-part">{display.split(":")[1] ?? "—"}</span>
      </button>

      {open ? (
        <TimePickerModal
          ariaLabel={ariaLabel}
          allowEmpty={allowEmpty}
          minuteStep={minuteStep}
          minMinutes={minMinutes}
          maxMinutes={maxMinutes}
          initialValue={value}
          onConfirm={onChange}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}

type TimeDisplayProps = {
  children: string;
  className?: string;
};

/** Статичное время (подписи, начало интервала). */
export function TimeDisplay({ children, className = "" }: TimeDisplayProps) {
  return <span className={`time-display${className ? ` ${className}` : ""}`}>{children}</span>;
}
