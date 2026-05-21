import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  blockStatus,
  blocksToSlots,
  blockIndexForSlot,
  clearBlockIntervalAt,
  removeBlockTaskAt,
  countDayScheduledMinutes,
  countWorkRoutineMinutes,
  dayOccupancyTone,
  workRoutineOccupancyTone,
  defaultDayBlocks,
  DAY_END_MIN as SCHEDULE_DAY_END_MIN,
  formatOccupancyDuration,
  formatScheduleRange,
  formatScheduleTime,
  loadScheduleNotes,
  normalizeDaySchedule,
  parseScheduleTimeInput,
  setBlockEndInDay,
  SCHEDULE_STORAGE_KEY,
  visibleScheduleSlots,
  type DayBlock,
  type BlockStatus,
} from "./plannerDaySchedule";
import { TimeDisplay, TimeField } from "./TimeField";
import "./PlannerCalendar.css";

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const STORAGE_KEY = SCHEDULE_STORAGE_KEY;
const GEO_CONSENT_KEY = "mytodo-planner-geo-consent";
const HOLIDAY_COUNTRY_KEY = "mytodo-planner-holiday-country";
const USER_HOLIDAYS_KEY = "mytodo-planner-user-holidays";
const WORK_DAY_STORAGE_KEY = "mytodo-planner-work-days";
const DEFAULT_HOLIDAY_COUNTRY = "RU";

type DayModalTab = "schedule" | "work";

type WorkDayInfo = {
  workStart: string;
  workEnd: string;
  address: string;
  wakeUp: string;
  returnHome: string;
};

const EMPTY_WORK_DAY: WorkDayInfo = {
  workStart: "",
  workEnd: "",
  address: "",
  wakeUp: "",
  returnHome: "",
};

const DAY_MODAL_TABS: { id: DayModalTab; label: string }[] = [
  { id: "schedule", label: "Расписание на день" },
  { id: "work", label: "Рабочий день" },
];
const DAY_END_MIN = SCHEDULE_DAY_END_MIN;
const EXPAND_ANIMATION_MS = 700;

const FAILED_TASK_PREFIX = "Не выполнено: ";

function isBlockPermanentlyLocked(block: DayBlock | undefined): boolean {
  return blockStatus(block) === "failed";
}

function hasBlockTaskText(block: DayBlock | undefined): boolean {
  return typeof block?.text === "string" && block.text.trim().length > 0;
}

function formatFailedTaskText(reason: string, existingText?: string): string {
  const reasonLine = `${FAILED_TASK_PREFIX}${reason.trim()}`;
  const existing = existingText?.trim();
  if (!existing) return reasonLine;
  return `${existing}\n\n${reasonLine}`;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Календарный день `date` строго раньше сегодняшнего (локальное время). */
function isPastDay(date: Date): boolean {
  const now = new Date();
  const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const t1 = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  return t1 < t0;
}

/** Интервал [startMin, endMin) для календарного дня `date` уже полностью прошёл относительно `now`. */
function isPastSlot(date: Date, endMin: number, now: Date): boolean {
  if (!sameDay(date, now)) return false;
  const h = Math.floor(endMin / 60);
  const m = endMin % 60;
  const slotEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
  return now.getTime() >= slotEnd.getTime();
}

function dateFromKey(key: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  return new Date(y, mo, d);
}

function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Ключ месяц–день для ежегодных пользовательских праздников (локальный календарь). */
function monthDayKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${m}-${day}`;
}

type GeoConsent = "unknown" | "granted" | "declined";

function loadGeoConsent(): GeoConsent {
  try {
    const v = localStorage.getItem(GEO_CONSENT_KEY);
    if (v === "granted" || v === "declined") return v;
  } catch {
    /* ignore */
  }
  return "unknown";
}

function persistGeoConsent(c: Exclude<GeoConsent, "unknown">) {
  try {
    localStorage.setItem(GEO_CONSENT_KEY, c);
  } catch {
    /* ignore */
  }
}

function loadHolidayCountry(): string | null {
  try {
    const c = localStorage.getItem(HOLIDAY_COUNTRY_KEY);
    if (typeof c === "string" && /^[A-Za-z]{2}$/.test(c)) return c.toUpperCase();
  } catch {
    /* ignore */
  }
  return null;
}

function persistHolidayCountry(code: string) {
  try {
    localStorage.setItem(HOLIDAY_COUNTRY_KEY, code.toUpperCase());
  } catch {
    /* ignore */
  }
}

function loadUserHolidays(): Record<string, string> {
  try {
    const raw = localStorage.getItem(USER_HOLIDAYS_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as unknown;
    if (typeof p !== "object" || p === null) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(p)) {
      if (/^\d{2}-\d{2}$/.test(k) && typeof v === "string") {
        const t = v.trim();
        if (t) out[k] = t;
      }
    }
    return out;
  } catch {
    return {};
  }
}

function persistUserHolidays(map: Record<string, string>) {
  try {
    localStorage.setItem(USER_HOLIDAYS_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

function normalizeWorkDay(raw: unknown): WorkDayInfo {
  if (typeof raw !== "object" || raw === null) return { ...EMPTY_WORK_DAY };
  const o = raw as Record<string, unknown>;
  return {
    workStart: typeof o.workStart === "string" ? o.workStart : "",
    workEnd: typeof o.workEnd === "string" ? o.workEnd : "",
    address: typeof o.address === "string" ? o.address : "",
    wakeUp: typeof o.wakeUp === "string" ? o.wakeUp : "",
    returnHome: typeof o.returnHome === "string" ? o.returnHome : "",
  };
}

function loadWorkDaysFromStorage(): Record<string, WorkDayInfo> {
  try {
    const raw = localStorage.getItem(WORK_DAY_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) return {};
    const out: Record<string, WorkDayInfo> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(k)) out[k] = normalizeWorkDay(v);
    }
    return out;
  } catch {
    return {};
  }
}

/** Государственные праздники из локальной базы `date-holidays` (без сети, без CORS). */
function buildHolidayMap(
  HolidaysClass: typeof import("date-holidays").default,
  countryCode: string,
  centerYear: number,
): Record<string, string> {
  const years = [centerYear - 1, centerYear, centerYear + 1];
  const fill = (cc: string): Record<string, string> => {
    const hd = new HolidaysClass(cc, { languages: ["ru", "en"], types: ["public"] });
    const map: Record<string, string> = {};
    for (const y of years) {
      let list = hd.getHolidays(y, "ru");
      if (!list.length) list = hd.getHolidays(y, "en");
      for (const h of list) {
        const k = h.date.slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) continue;
        const label = (h.name || "").trim();
        if (!label) continue;
        if (map[k]) map[k] = `${map[k]}; ${label}`;
        else map[k] = label;
      }
    }
    return map;
  };
  try {
    return fill(countryCode);
  } catch {
    if (countryCode === DEFAULT_HOLIDAY_COUNTRY) return {};
    try {
      return fill(DEFAULT_HOLIDAY_COUNTRY);
    } catch {
      return {};
    }
  }
}

function mergeRuApiWithLib(ru: Record<string, string>, lib: Record<string, string>): Record<string, string> {
  const out = { ...ru };
  for (const [k, v] of Object.entries(lib)) {
    if (typeof v === "string" && v.trim()) out[k] = v.trim();
  }
  return out;
}

function daysInCalendarYear(y: number): number {
  return new Date(y, 1, 29).getMonth() === 1 ? 366 : 365;
}

/** Нерабочие дни по производственному календарю РФ: 8 — праздник, 1 в будни — перенос/мостик и т.п. */
function parseRuProductionCalendar(year: number, body: string): Record<string, string> {
  const map: Record<string, string> = {};
  const max = Math.min(body.length, daysInCalendarYear(year));
  for (let i = 0; i < max; i++) {
    const d = new Date(year, 0, 1 + i);
    if (d.getFullYear() !== year) break;
    const ch = body[i];
    if (ch === "0" || ch === "2") continue;
    const dow = d.getDay();
    const k = dateKey(d);
    if (ch === "8") {
      map[k] = "Нерабочий праздничный день";
    } else if (ch === "1") {
      if (dow === 0 || dow === 6) continue;
      map[k] = "Нерабочий день (производственный календарь)";
    } else if (ch === "4") {
      map[k] = "Нерабочий день";
    }
  }
  return map;
}

async function fetchIsdayoffYear(y: number): Promise<string | null> {
  const url = `https://isdayoff.ru/api/getdata?year=${y}&pre=1&holiday=1`;
  const ctrl = new AbortController();
  const t = window.setTimeout(() => ctrl.abort(), 14_000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    const text = (await res.text()).trim();
    if (!res.ok || text === "101" || text === "100" || text === "199" || text === "") return null;
    if (!/^[01248]+$/.test(text)) return null;
    return text;
  } catch {
    return null;
  } finally {
    window.clearTimeout(t);
  }
}

async function fetchRuNonWorkingByDateKeys(years: number[]): Promise<Record<string, string>> {
  const settled = await Promise.all(
    years.map(async (y) => {
      const raw = await fetchIsdayoffYear(y);
      return raw ? parseRuProductionCalendar(y, raw) : {};
    }),
  );
  const merged: Record<string, string> = {};
  for (const part of settled) {
    Object.assign(merged, part);
  }
  return merged;
}

async function reverseGeocodeCountryCode(lat: number, lng: number): Promise<string | null> {
  const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(String(lat))}&longitude=${encodeURIComponent(String(lng))}&localityLanguage=ru`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = (await res.json()) as { countryCode?: string };
  const code = typeof data.countryCode === "string" ? data.countryCode.trim().toUpperCase() : "";
  if (!/^[A-Z]{2}$/.test(code)) return null;
  return code;
}

function initialHolidayCountry(consent: GeoConsent): string | null {
  if (consent === "unknown") return null;
  return loadHolidayCountry() ?? DEFAULT_HOLIDAY_COUNTRY;
}

function buildMonthGrid(year: number, month: number): { date: Date; inMonth: boolean }[] {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const padStart = (first.getDay() + 6) % 7;
  const daysThisMonth = last.getDate();
  const cells: { date: Date; inMonth: boolean }[] = [];

  const prevMonthLast = new Date(year, month, 0).getDate();
  for (let i = 0; i < padStart; i++) {
    const day = prevMonthLast - padStart + i + 1;
    cells.push({ date: new Date(year, month - 1, day), inMonth: false });
  }
  for (let d = 1; d <= daysThisMonth; d++) {
    cells.push({ date: new Date(year, month, d), inMonth: true });
  }
  let next = 1;
  while (cells.length % 7 !== 0) {
    cells.push({ date: new Date(year, month + 1, next), inMonth: false });
    next += 1;
  }
  return cells;
}

function minToTimeInputValue(min: number): string {
  if (min >= DAY_END_MIN) return "23:59";
  return formatScheduleTime(min);
}

/** Макс. высота поля заметки (px); дальше — прокрутка внутри поля. */
const HOUR_NOTE_FIELD_MAX_HEIGHT_PX = 280;

function syncHourNoteTextareaHeight(el: HTMLTextAreaElement | null) {
  if (!el) return;
  const minPx = parseFloat(getComputedStyle(el).minHeight) || 44;
  el.style.height = "auto";
  el.style.overflowY = "hidden";
  const sh = Math.max(el.scrollHeight, minPx);
  if (sh > HOUR_NOTE_FIELD_MAX_HEIGHT_PX) {
    el.style.height = `${HOUR_NOTE_FIELD_MAX_HEIGHT_PX}px`;
    el.style.overflowY = "auto";
  } else {
    el.style.height = `${sh}px`;
  }
}

type HourNoteFieldProps = {
  id: string;
  value: string;
  readOnly: boolean;
  placeholder: string;
  ariaLabel: string;
  onChange: (value: string) => void;
};

function HourNoteField({ id, value, readOnly, placeholder, ariaLabel, onChange }: HourNoteFieldProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    syncHourNoteTextareaHeight(ref.current);
  }, [value, readOnly]);

  useEffect(() => {
    function onResize() {
      syncHourNoteTextareaHeight(ref.current);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <textarea
      ref={ref}
      id={id}
      className="hour-row__field"
      rows={1}
      value={value}
      readOnly={readOnly}
      placeholder={placeholder}
      aria-label={ariaLabel}
      spellCheck
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function geolocationErrorHint(code: number): string {
  if (code === 1) {
    return "В браузере отказано в доступе к геолокации. Разрешите доступ в настройках сайта и нажмите «Разрешить» ещё раз.";
  }
  if (code === 2) return "Позиция временно недоступна. Попробуйте позже.";
  if (code === 3) return "Превышено время ожидания. Проверьте сеть и попробуйте снова.";
  return "Не удалось определить местоположение. Попробуйте позже.";
}

type PlannerCalendarProps = {
  onNotesByDayChange?: (notes: Record<string, DayBlock[]>) => void;
};

export function PlannerCalendar({ onNotesByDayChange }: PlannerCalendarProps = {}) {
  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [notesByDay, setNotesByDay] = useState<Record<string, DayBlock[]>>(loadScheduleNotes);
  const [workDaysByKey, setWorkDaysByKey] = useState<Record<string, WorkDayInfo>>(loadWorkDaysFromStorage);
  const [dayModalTab, setDayModalTab] = useState<DayModalTab>("schedule");
  const [geoConsent, setGeoConsent] = useState<GeoConsent>(() => loadGeoConsent());
  const [holidayCountry, setHolidayCountry] = useState<string | null>(() => initialHolidayCountry(loadGeoConsent()));
  const [holidaysByKey, setHolidaysByKey] = useState<Record<string, string>>({});
  const [calendarHint, setCalendarHint] = useState<string | null>(null);
  const [userHolidaysByMd, setUserHolidaysByMd] = useState<Record<string, string>>(loadUserHolidays);
  const [userHolEditing, setUserHolEditing] = useState(false);
  const [userHolDraft, setUserHolDraft] = useState("");
  const [geoPromptBusy, setGeoPromptBusy] = useState(false);
  const [geoPromptError, setGeoPromptError] = useState<string | null>(null);
  const [modalEntered, setModalEntered] = useState(false);
  const [failReasonModal, setFailReasonModal] = useState<{ key: string; index: number } | null>(null);
  const [failReasonDraft, setFailReasonDraft] = useState("");
  const [expandOrigin, setExpandOrigin] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const gridWrapRef = useRef<HTMLDivElement | null>(null);
  const dayButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const closeTimeoutRef = useRef<number | null>(null);
  const openRafRef = useRef<number | null>(null);
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notesByDay));
  }, [notesByDay]);

  useEffect(() => {
    onNotesByDayChange?.(notesByDay);
  }, [notesByDay, onNotesByDayChange]);

  useEffect(() => {
    try {
      localStorage.setItem(WORK_DAY_STORAGE_KEY, JSON.stringify(workDaysByKey));
    } catch {
      /* ignore */
    }
  }, [workDaysByKey]);

  useEffect(() => {
    persistUserHolidays(userHolidaysByMd);
  }, [userHolidaysByMd]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();

  useEffect(() => {
    if (geoConsent !== "granted") return;
    if (holidayCountry) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      persistHolidayCountry(DEFAULT_HOLIDAY_COUNTRY);
      setHolidayCountry(DEFAULT_HOLIDAY_COUNTRY);
      return;
    }
    let cancelled = false;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const cc =
            (await reverseGeocodeCountryCode(pos.coords.latitude, pos.coords.longitude)) ??
            DEFAULT_HOLIDAY_COUNTRY;
          if (cancelled) return;
          persistHolidayCountry(cc);
          setHolidayCountry(cc);
        } catch {
          if (cancelled) return;
          persistHolidayCountry(DEFAULT_HOLIDAY_COUNTRY);
          setHolidayCountry(DEFAULT_HOLIDAY_COUNTRY);
        }
      },
      () => {
        if (cancelled) return;
        persistHolidayCountry(DEFAULT_HOLIDAY_COUNTRY);
        setHolidayCountry(DEFAULT_HOLIDAY_COUNTRY);
      },
      { maximumAge: 60 * 60 * 1000, timeout: 15_000, enableHighAccuracy: false },
    );
    return () => {
      cancelled = true;
    };
  }, [geoConsent, holidayCountry]);

  useEffect(() => {
    if (!holidayCountry) {
      setHolidaysByKey({});
      setCalendarHint(null);
      return;
    }
    let cancelled = false;
    const years = [year - 1, year, year + 1];

    void (async () => {
      try {
        const mod = await import("date-holidays");
        if (cancelled) return;
        const lib = buildHolidayMap(mod.default, holidayCountry, year);
        if (cancelled) return;

        if (holidayCountry === "RU") {
          const ru = await fetchRuNonWorkingByDateKeys(years);
          if (cancelled) return;
          const merged = mergeRuApiWithLib(ru, lib);
          setHolidaysByKey(merged);
          const ruCount = Object.keys(ru).length;
          setCalendarHint(
            ruCount > 0
              ? `Года ${years[0]}–${years[2]}: нерабочие дни РФ по API isdayoff.ru; названия праздников — из локального справочника.`
              : "Календарь isdayoff.ru недоступен — показаны только праздники из локального справочника (переносы могут не совпадать).",
          );
        } else {
          setHolidaysByKey(lib);
          setCalendarHint(`Года ${years[0]}–${years[2]}: праздники из локального справочника по стране ${holidayCountry}.`);
        }
      } catch {
        if (!cancelled) {
          setHolidaysByKey({});
          setCalendarHint(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [holidayCountry, year]);

  const declineGeoConsent = useCallback(() => {
    persistGeoConsent("declined");
    persistHolidayCountry(DEFAULT_HOLIDAY_COUNTRY);
    setGeoConsent("declined");
    setHolidayCountry(DEFAULT_HOLIDAY_COUNTRY);
    setGeoPromptError(null);
  }, []);

  const acceptGeoConsent = useCallback(() => {
    setGeoPromptError(null);
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoPromptError("Ваш браузер не поддерживает геолокацию.");
      return;
    }
    setGeoPromptBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const cc =
            (await reverseGeocodeCountryCode(pos.coords.latitude, pos.coords.longitude)) ??
            DEFAULT_HOLIDAY_COUNTRY;
          persistHolidayCountry(cc);
          setHolidayCountry(cc);
          persistGeoConsent("granted");
          setGeoConsent("granted");
        } catch {
          persistHolidayCountry(DEFAULT_HOLIDAY_COUNTRY);
          setHolidayCountry(DEFAULT_HOLIDAY_COUNTRY);
          persistGeoConsent("granted");
          setGeoConsent("granted");
        } finally {
          setGeoPromptBusy(false);
        }
      },
      (err: GeolocationPositionError) => {
        setGeoPromptBusy(false);
        setGeoPromptError(geolocationErrorHint(err.code));
      },
      { maximumAge: 60 * 1000, timeout: 20_000, enableHighAccuracy: false },
    );
  }, []);

  useEffect(() => {
    if (!selectedDate) {
      setModalEntered(false);
    }
    setUserHolEditing(false);
    setUserHolDraft("");
    setFailReasonModal(null);
    setFailReasonDraft("");
    setDayModalTab("schedule");
  }, [selectedDate]);

  useEffect(
    () => () => {
      if (closeTimeoutRef.current !== null) {
        window.clearTimeout(closeTimeoutRef.current);
      }
      if (openRafRef.current !== null) {
        window.cancelAnimationFrame(openRafRef.current);
      }
    },
    [],
  );

  const title = useMemo(
    () =>
      new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" })
        .format(cursor)
        .replace(/^./, (c) => c.toUpperCase()),
    [cursor],
  );

  const grid = useMemo(() => buildMonthGrid(year, month), [year, month]);

  const selectedKey = selectedDate ? dateKey(selectedDate) : null;

  const selectedWorkDay = useMemo(() => {
    if (!selectedKey) return EMPTY_WORK_DAY;
    return workDaysByKey[selectedKey] ?? EMPTY_WORK_DAY;
  }, [selectedKey, workDaysByKey]);

  const blocksForSelected = useMemo(() => {
    if (!selectedKey) return defaultDayBlocks();
    return normalizeDaySchedule(notesByDay[selectedKey]);
  }, [notesByDay, selectedKey]);

  const visibleSlotsForSelected = useMemo(
    () =>
      selectedKey
        ? visibleScheduleSlots(blocksForSelected, {
            wakeUp: selectedWorkDay.wakeUp,
            returnHome: selectedWorkDay.returnHome,
          })
        : [],
    [blocksForSelected, selectedKey, selectedWorkDay.wakeUp, selectedWorkDay.returnHome],
  );

  const modalWeekday = useMemo(() => {
    if (!selectedDate) return "";
    return new Intl.DateTimeFormat("ru-RU", { weekday: "long" })
      .format(selectedDate)
      .replace(/^./, (c) => c.toUpperCase());
  }, [selectedDate]);

  const modalDateLine = useMemo(() => {
    if (!selectedDate) return "";
    return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(selectedDate);
  }, [selectedDate]);

  const deleteBlockTask = useCallback((key: string, blockIndex: number) => {
    const day = dateFromKey(key);
    if (day && isPastDay(day)) return;
    setNotesByDay((prev) => {
      const base = [...normalizeDaySchedule(prev[key])];
      return { ...prev, [key]: removeBlockTaskAt(base, blockIndex) };
    });
  }, []);

  const setBlockNote = useCallback((key: string, index: number, text: string) => {
    const day = dateFromKey(key);
    const now = new Date();
    if (day && isPastDay(day)) return;
    setNotesByDay((prev) => {
      const base = [...normalizeDaySchedule(prev[key])];
      if (isBlockPermanentlyLocked(base[index])) return prev;
      const slots = blocksToSlots(base);
      if (day && slots[index] && isPastSlot(day, slots[index].endMin, now)) return prev;
      if (!text.trim()) {
        return { ...prev, [key]: clearBlockIntervalAt(base, index) };
      }
      const block = base[index];
      const next: DayBlock = { ...block, text };
      if (blockStatus(block) === "done") next.status = "open";
      base[index] = next;
      return { ...prev, [key]: normalizeDaySchedule(base) };
    });
  }, []);

  const toggleBlockDone = useCallback((key: string, index: number) => {
    const day = dateFromKey(key);
    const now = new Date();
    if (day && isPastDay(day)) return;
    setNotesByDay((prev) => {
      const base = [...normalizeDaySchedule(prev[key])];
      const block = base[index];
      if (!block || isBlockPermanentlyLocked(block)) return prev;
      const slots = blocksToSlots(base);
      if (day && slots[index] && isPastSlot(day, slots[index].endMin, now)) return prev;
      const nextStatus: BlockStatus = blockStatus(block) === "done" ? "open" : "done";
      base[index] = { ...block, status: nextStatus };
      return { ...prev, [key]: base };
    });
  }, []);

  const canChangeBlockStatus = useCallback(
    (key: string, index: number, blocks: DayBlock[]) => {
      const day = dateFromKey(key);
      const now = new Date();
      if (day && isPastDay(day)) return false;
      const block = blocks[index];
      if (!block || isBlockPermanentlyLocked(block) || !hasBlockTaskText(block)) return false;
      const slots = blocksToSlots(blocks);
      if (day && slots[index] && isPastSlot(day, slots[index].endMin, now)) return false;
      return true;
    },
    [],
  );

  const openFailReasonModal = useCallback(
    (key: string, index: number) => {
      const blocks = normalizeDaySchedule(notesByDay[key]);
      if (!canChangeBlockStatus(key, index, blocks)) return;
      setFailReasonDraft("");
      setFailReasonModal({ key, index });
    },
    [notesByDay, canChangeBlockStatus],
  );

  const closeFailReasonModal = useCallback(() => {
    setFailReasonModal(null);
    setFailReasonDraft("");
  }, []);

  useEffect(() => {
    if (!selectedDate) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (failReasonModal) {
        closeFailReasonModal();
        return;
      }
      setSelectedDate(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedDate, failReasonModal, closeFailReasonModal]);

  const confirmFailReason = useCallback(() => {
    if (!failReasonModal) return;
    const reason = failReasonDraft.trim();
    if (!reason) return;
    const { key, index } = failReasonModal;
    setNotesByDay((prev) => {
      const base = [...normalizeDaySchedule(prev[key])];
      const block = base[index];
      if (!block || isBlockPermanentlyLocked(block)) return prev;
      base[index] = { ...block, text: formatFailedTaskText(reason, block.text), status: "failed" };
      return { ...prev, [key]: base };
    });
    closeFailReasonModal();
  }, [failReasonModal, failReasonDraft, closeFailReasonModal]);

  const setBlockEnd = useCallback((key: string, index: number, endMin: number) => {
    const day = dateFromKey(key);
    const now = new Date();
    if (day && isPastDay(day)) return;
    setNotesByDay((prev) => {
      const slots = blocksToSlots(normalizeDaySchedule(prev[key]));
      const slot = slots[index];
      if (!slot) return prev;
      if (day && isPastSlot(day, slot.endMin, now)) return prev;
      const base = [...normalizeDaySchedule(prev[key])];
      const block = base[index];
      if (isBlockPermanentlyLocked(block) || !hasBlockTaskText(block)) return prev;
      return { ...prev, [key]: setBlockEndInDay(base, index, endMin) };
    });
  }, []);

  const captureExpandOrigin = useCallback((date: Date) => {
    const key = dateKey(date);
    const btn = dayButtonRefs.current[key];
    const wrap = gridWrapRef.current;
    if (btn && wrap) {
      const b = btn.getBoundingClientRect();
      const w = wrap.getBoundingClientRect();
      setExpandOrigin({
        x: b.left - w.left,
        y: b.top - w.top,
        width: b.width,
        height: b.height,
      });
    } else {
      setExpandOrigin(null);
    }
  }, []);

  const closeDay = useCallback(() => {
    if (!selectedDate) return;
    captureExpandOrigin(selectedDate);
    setModalEntered(false);
    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current);
    }
    closeTimeoutRef.current = window.setTimeout(() => {
      setSelectedDate(null);
      closeTimeoutRef.current = null;
    }, EXPAND_ANIMATION_MS);
  }, [captureExpandOrigin, selectedDate]);

  /** Раз в минуту обновляем «сегодня», чтобы read-only для вчерашнего дня включался после полуночи. */
  const [, setClockTick] = useState(0);
  useEffect(() => {
    if (!selectedDate) return;
    const id = window.setInterval(() => setClockTick((n) => n + 1), 60_000);
    return () => window.clearInterval(id);
  }, [selectedDate]);

  const openDay = useCallback((date: Date) => {
    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    if (openRafRef.current !== null) {
      window.cancelAnimationFrame(openRafRef.current);
    }
    setModalEntered(false);
    setSelectedDate(date);
    openRafRef.current = window.requestAnimationFrame(() => {
      openRafRef.current = window.requestAnimationFrame(() => {
        setModalEntered(true);
      });
    });
  }, []);

  const handleDayActivate = useCallback((date: Date, inMonth: boolean) => {
    if (selectedDate && sameDay(selectedDate, date)) {
      closeDay();
      return;
    }
    captureExpandOrigin(date);
    openDay(date);
    if (!inMonth) {
      setCursor(new Date(date.getFullYear(), date.getMonth(), 1));
    }
  }, [captureExpandOrigin, closeDay, openDay, selectedDate]);

  function prevMonth() {
    setCursor(new Date(year, month - 1, 1));
  }

  function nextMonth() {
    setCursor(new Date(year, month + 1, 1));
  }

  function goToday() {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    captureExpandOrigin(d);
    setCursor(new Date(today.getFullYear(), today.getMonth(), 1));
    openDay(d);
  }

  const expandStyle: CSSProperties | undefined = useMemo(() => {
    if (!expandOrigin || !gridWrapRef.current || modalEntered) return undefined;
    const wrapRect = gridWrapRef.current.getBoundingClientRect();
    const sx = expandOrigin.width / Math.max(1, wrapRect.width);
    const sy = expandOrigin.height / Math.max(1, wrapRect.height);
    return {
      transformOrigin: "top left",
      transform: `translate(${expandOrigin.x}px, ${expandOrigin.y}px) scale(${sx}, ${sy})`,
    };
  }, [expandOrigin, modalEntered]);

  const selectedIsPast = Boolean(selectedDate && isPastDay(selectedDate));

  const updateWorkDayField = useCallback(
    (field: keyof WorkDayInfo, value: string) => {
      if (!selectedKey || selectedIsPast) return;
      setWorkDaysByKey((prev) => ({
        ...prev,
        [selectedKey]: { ...(prev[selectedKey] ?? EMPTY_WORK_DAY), [field]: value },
      }));
    },
    [selectedKey, selectedIsPast],
  );

  const selectedMonthDayKey = useMemo(() => (selectedDate ? monthDayKey(selectedDate) : null), [selectedDate]);

  const selectedUserHolidayName = useMemo(
    () => (selectedMonthDayKey ? userHolidaysByMd[selectedMonthDayKey] : undefined),
    [selectedMonthDayKey, userHolidaysByMd],
  );

  const saveUserHoliday = useCallback(() => {
    if (!selectedDate || !selectedMonthDayKey) return;
    if (isPastDay(selectedDate)) return;
    const t = userHolDraft.trim();
    if (!t) {
      setUserHolEditing(false);
      setUserHolDraft("");
      return;
    }
    setUserHolidaysByMd((prev) => ({ ...prev, [selectedMonthDayKey]: t }));
    setUserHolEditing(false);
    setUserHolDraft("");
  }, [selectedDate, selectedMonthDayKey, userHolDraft]);

  const removeUserHoliday = useCallback(() => {
    if (!selectedMonthDayKey) return;
    setUserHolidaysByMd((prev) => {
      const next = { ...prev };
      delete next[selectedMonthDayKey];
      return next;
    });
    setUserHolEditing(false);
    setUserHolDraft("");
  }, [selectedMonthDayKey]);

  const beginUserHolidayEdit = useCallback(() => {
    if (!selectedDate || isPastDay(selectedDate)) return;
    setUserHolDraft(selectedUserHolidayName ?? "");
    setUserHolEditing(true);
  }, [selectedDate, selectedUserHolidayName]);

  const geoSupported = typeof navigator !== "undefined" && Boolean(navigator.geolocation);

  const holidayCountryLabel = useMemo(() => {
    if (!holidayCountry) return "";
    try {
      return new Intl.DisplayNames(["ru-RU"], { type: "region" }).of(holidayCountry) ?? holidayCountry;
    } catch {
      return holidayCountry;
    }
  }, [holidayCountry]);

  const selectedHolidayNames = selectedKey ? holidaysByKey[selectedKey] : undefined;

  return (
    <div className="planner-cal">
      <div className="planner-cal__toolbar">
        <div className="planner-cal__month-row">
          <button type="button" className="planner-cal__nav planner-cal__nav--icon" onClick={prevMonth} aria-label="Предыдущий месяц">
            ‹
          </button>
          <h2 className="planner-cal__title">{title}</h2>
          <button type="button" className="planner-cal__nav planner-cal__nav--icon" onClick={nextMonth} aria-label="Следующий месяц">
            ›
          </button>
        </div>
        <button type="button" className="planner-cal__today" onClick={goToday}>
          Сегодня
        </button>
      </div>

      {geoConsent === "unknown" ? (
        <div
          className="geo-consent"
          role="dialog"
          aria-modal="false"
          aria-labelledby="geo-consent-title"
          aria-describedby="geo-consent-desc"
        >
          <p className="geo-consent__title" id="geo-consent-title">
            Местоположение для праздников
          </p>
          <p className="geo-consent__text" id="geo-consent-desc">
            Координаты не сохраняются и никуда не отправляются: по ним один раз определяется код страны. Для России
            нерабочие дни по годам подгружаются с isdayoff.ru (производственный календарь), названия праздников
            уточняются локально. Для других стран — только локальный справочник. Браузер спросит доступ к геолокации —
            вы сами решаете, разрешать ли его. Если нажмёте «Не сейчас», будет использована Россия по умолчанию.
          </p>
          {geoPromptError ? (
            <p className="geo-consent__error" role="alert">
              {geoPromptError}
            </p>
          ) : null}
          <div className="geo-consent__actions">
            <button
              type="button"
              className="geo-consent__btn geo-consent__btn--secondary"
              disabled={geoPromptBusy}
              onClick={declineGeoConsent}
            >
              Не сейчас
            </button>
            <button
              type="button"
              className="geo-consent__btn geo-consent__btn--primary"
              disabled={geoPromptBusy || !geoSupported}
              onClick={acceptGeoConsent}
            >
              {geoPromptBusy ? "Запрос…" : "Разрешить и подобрать страну"}
            </button>
          </div>
        </div>
      ) : null}

      {geoConsent !== "unknown" && holidayCountry ? (
        <p className="planner-cal__holidays-meta" role="status">
          {Object.keys(holidaysByKey).length === 0
            ? `Календарь: ${holidayCountryLabel} (${holidayCountry}) — не удалось сформировать подсказки по датам.`
            : calendarHint ?? `Календарь: ${holidayCountryLabel} (${holidayCountry}).`}
        </p>
      ) : null}

      <div className="planner-cal__weekdays" aria-hidden>
        {WEEKDAYS.map((d) => (
          <div key={d} className="planner-cal__weekday">
            {d}
          </div>
        ))}
      </div>

      <div className={`planner-cal__grid-wrap${modalEntered ? " planner-cal__grid-wrap--modal-entered" : ""}`} ref={gridWrapRef}>
        <div className="planner-cal__grid" role="grid" aria-label={`Календарь: ${title}`}>
          {grid.map(({ date, inMonth }, i) => {
            const isToday = sameDay(date, today);
            const weekend = date.getDay() === 0 || date.getDay() === 6;
            const isSelected = Boolean(selectedDate && sameDay(date, selectedDate));
            const key = dateKey(date);
            const scheduledMinutes = countDayScheduledMinutes(notesByDay[key]);
            const dotTone = dayOccupancyTone(scheduledMinutes);
            const occupancyLabel = formatOccupancyDuration(scheduledMinutes);
            const workDay = workDaysByKey[key] ?? EMPTY_WORK_DAY;
            const workRoutineMinutes = countWorkRoutineMinutes(workDay.wakeUp, workDay.returnHome);
            const workDotTone = workRoutineOccupancyTone(workRoutineMinutes);
            const workRoutineLabel = formatOccupancyDuration(workRoutineMinutes);
            const past = isPastDay(date);
            const holidayNames = holidaysByKey[key];
            const isHoliday = Boolean(holidayNames);
            const mdKey = monthDayKey(date);
            const userHolName = userHolidaysByMd[mdKey];
            const isUserHoliday = Boolean(userHolName);
            const holidayNote = [
              isHoliday ? ` Праздник: ${holidayNames}.` : "",
              isUserHoliday ? ` Ваш праздник: ${userHolName}.` : "",
            ].join("");
            const workNote = workDotTone ? ` Рабочий интервал: ${workRoutineLabel}.` : "";
            const scheduleNote = scheduledMinutes > 0 ? ` Задачи: ${occupancyLabel}.` : "";
            const label = past
              ? scheduleNote || workNote
                ? `Просмотр дня ${date.toLocaleDateString("ru-RU")}.${scheduleNote}${workNote} Без редактирования.${holidayNote}`
                : `Просмотр дня ${date.toLocaleDateString("ru-RU")}, без редактирования.${holidayNote}`
              : scheduleNote || workNote
                ? `Открыть день ${date.toLocaleDateString("ru-RU")}.${scheduleNote}${workNote}${holidayNote}`
                : `Открыть день ${date.toLocaleDateString("ru-RU")}.${holidayNote}`;
            return (
              <button
                key={`${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${i}`}
                type="button"
                ref={(el) => {
                  dayButtonRefs.current[key] = el;
                }}
                role="gridcell"
                aria-label={label}
                aria-pressed={isSelected}
                onClick={() => handleDayActivate(date, inMonth)}
                className={`planner-cal__cell${inMonth ? "" : " planner-cal__cell--muted"}${isToday ? " planner-cal__cell--today" : ""}${weekend && inMonth ? " planner-cal__cell--weekend" : ""}${isSelected ? " planner-cal__cell--selected" : ""}${past ? " planner-cal__cell--past" : ""}${isHoliday ? " planner-cal__cell--holiday" : ""}${isUserHoliday ? " planner-cal__cell--user-holiday" : ""}`}
              >
                {isHoliday ? (
                  <span className="planner-cal__holiday-flag" title={holidayNames} aria-hidden>
                    ★
                  </span>
                ) : null}
                {isUserHoliday ? (
                  <span className="planner-cal__user-holiday-flag" title={userHolName} aria-hidden>
                    ★
                  </span>
                ) : null}
                <span className="planner-cal__day">{date.getDate()}</span>
                {workDotTone ? (
                  <span
                    className={`planner-cal__work-dot planner-cal__work-dot--${workDotTone}`}
                    title={`Работа (подъём — домой): ${workRoutineLabel}`}
                    aria-hidden
                  >
                    Р
                  </span>
                ) : null}
                {dotTone ? (
                  <span
                    className={`planner-cal__entry-dot planner-cal__entry-dot--${dotTone}`}
                    title={`Занято: ${occupancyLabel}`}
                    aria-hidden
                  />
                ) : null}
              </button>
            );
          })}
        </div>
        {selectedDate && selectedKey && (
          <div className={`day-modal day-modal--inline${modalEntered ? " day-modal--entered" : ""}`} role="presentation">
            <div
              className="day-modal__dialog"
              style={expandStyle}
              role="dialog"
              aria-modal="true"
              aria-labelledby="day-modal-title"
            >
              <header className="day-modal__header">
                <div className="day-modal__title-wrap">
                  <p className="day-modal__weekday">{modalWeekday}</p>
                  <div className="day-modal__title-row">
                    <p className="day-modal__date" id="day-modal-title">
                      {modalDateLine}
                    </p>
                    {!selectedIsPast && !userHolEditing && !selectedUserHolidayName ? (
                      <button
                        type="button"
                        className="day-modal__user-holiday-star"
                        onClick={() => {
                          setUserHolDraft("");
                          setUserHolEditing(true);
                        }}
                        aria-label="Добавить свой ежегодный праздник"
                      >
                        ★
                      </button>
                    ) : null}
                  </div>
                  {selectedHolidayNames ? (
                    <p className="day-modal__holiday-line" title={selectedHolidayNames}>
                      {selectedHolidayNames}
                    </p>
                  ) : null}
                  {selectedUserHolidayName && !userHolEditing ? (
                    <div className="day-modal__user-holiday-wrap">
                      <p className="day-modal__user-holiday-line" title={selectedUserHolidayName}>
                        {selectedUserHolidayName}
                      </p>
                      <div className="day-modal__user-holiday-actions">
                        {!selectedIsPast ? (
                          <button type="button" className="day-modal__user-holiday-link" onClick={beginUserHolidayEdit}>
                            Изменить
                          </button>
                        ) : null}
                        <button type="button" className="day-modal__user-holiday-link" onClick={removeUserHoliday}>
                          Удалить
                        </button>
                      </div>
                    </div>
                  ) : null}
                  {!selectedIsPast && userHolEditing ? (
                    <form
                      className="day-modal__user-holiday-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        saveUserHoliday();
                      }}
                    >
                      <input
                        className="day-modal__user-holiday-input"
                        autoFocus
                        value={userHolDraft}
                        onChange={(e) => setUserHolDraft(e.target.value)}
                        placeholder="Название праздника (каждый год)"
                        maxLength={120}
                        aria-label="Название вашего праздника"
                      />
                      <div className="day-modal__user-holiday-form-actions">
                        <button type="submit" className="day-modal__user-holiday-submit">
                          Сохранить
                        </button>
                        <button
                          type="button"
                          className="day-modal__user-holiday-cancel"
                          onClick={() => {
                            setUserHolEditing(false);
                            setUserHolDraft("");
                          }}
                        >
                          Отмена
                        </button>
                      </div>
                    </form>
                  ) : null}
                </div>
                <button type="button" className="day-modal__close" onClick={closeDay} aria-label="Закрыть">
                  ×
                </button>
              </header>

              <div className="day-modal__tabs" role="tablist" aria-label="Раздел дня">
                {DAY_MODAL_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    id={`day-modal-tab-${tab.id}`}
                    aria-selected={dayModalTab === tab.id}
                    aria-controls={`day-modal-panel-${tab.id}`}
                    tabIndex={dayModalTab === tab.id ? 0 : -1}
                    className={`day-modal__tab${dayModalTab === tab.id ? " day-modal__tab--active" : ""}`}
                    onClick={() => setDayModalTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {dayModalTab === "schedule" ? (
                <>
                  <div className="day-modal__intro">
                    <span className="day-modal__intro-line" aria-hidden />
                    <span className="day-modal__intro-text">
                      {selectedIsPast ? "Просмотр — новые записи недоступны" : "Расписание на сутки"}
                    </span>
                    <span className="day-modal__intro-line" aria-hidden />
                  </div>

                  <div
                    id="day-modal-panel-schedule"
                    role="tabpanel"
                    aria-labelledby="day-modal-tab-schedule"
                    className="hour-scroll"
                  >
                <ol className="hour-list" aria-label="Расписание дня">
                  {(() => {
                    const nowForSlots = new Date();
                    return visibleSlotsForSelected.map(({ slot, blockIndex }, visIndex) => {
                    const quiet = slot.startMin < 7 * 60 || slot.startMin >= 23 * 60;
                    const note = slot.text;
                    const slotStatus = slot.status;
                    const slotFailed = slotStatus === "failed";
                    const slotDone = slotStatus === "done";
                    const slotLabel = `Интервал ${formatScheduleRange(slot.startMin, slot.endMin)}`;
                    const fieldId = `hour-note-${selectedKey}-${blockIndex}`;
                    const slotPast =
                      Boolean(selectedDate && !selectedIsPast && isPastSlot(selectedDate, slot.endMin, nowForSlots));
                    const rowReadOnly = selectedIsPast || slotPast || slotFailed;
                    const hasTask = note.trim().length > 0;
                    const statusActionsEnabled =
                      !rowReadOnly && canChangeBlockStatus(selectedKey, blockIndex, blocksForSelected);
                    const timeEditEnabled = !rowReadOnly && hasTask;
                    const minEnd = slot.startMin + 1;
                    const nextVisible = visibleSlotsForSelected[visIndex + 1];
                    const nextSlot = nextVisible?.slot ?? null;
                    const maxEnd = nextSlot
                      ? nextSlot.text.trim()
                        ? Math.max(minEnd, nextSlot.startMin)
                        : Math.max(minEnd, nextSlot.endMin - 1)
                      : DAY_END_MIN - 1;
                    return (
                      <li
                        key={blockIndex}
                        className={`hour-row${quiet ? " hour-row--quiet" : ""}${slotDone ? " hour-row--done" : ""}${slotFailed ? " hour-row--failed" : ""}`}
                      >
                        <div className="hour-row__card">
                          <div className="hour-row__time-col">
                            <button
                              type="button"
                              className="hour-row__time-btn"
                              aria-label={`${slotLabel}. Перейти к полю задачи`}
                              onClick={() => document.getElementById(fieldId)?.focus()}
                            >
                              <TimeDisplay className="hour-row__clock">
                                {formatScheduleTime(slot.startMin)}
                              </TimeDisplay>
                            </button>
                            <div className="hour-row__end-label">
                              <span className="hour-row__end-caption">до</span>
                              <TimeField
                                size="compact"
                                minuteStep={60}
                                value={minToTimeInputValue(slot.endMin)}
                                minMinutes={minEnd}
                                maxMinutes={maxEnd}
                                disabled={!timeEditEnabled}
                                aria-label={`Конец интервала, ${slotLabel}`}
                                onChange={(next) => {
                                  const parsed = parseScheduleTimeInput(next);
                                  if (parsed === null) return;
                                  const endValue =
                                    visIndex === visibleSlotsForSelected.length - 1 && parsed >= 23 * 60 + 59
                                      ? DAY_END_MIN
                                      : parsed;
                                  setBlockEnd(selectedKey, blockIndex, endValue);
                                }}
                              />
                            </div>
                          </div>
                          <div className="hour-row__main">
                            <div className="hour-row__status" role="group" aria-label="Действия с задачей">
                              <button
                                type="button"
                                className={`hour-row__status-btn hour-row__status-btn--done${slotDone ? " hour-row__status-btn--active" : ""}`}
                                disabled={!statusActionsEnabled}
                                aria-pressed={slotDone}
                                aria-label="Отметить как выполненную"
                                title={statusActionsEnabled ? "Выполнено" : "Сначала запишите задачу"}
                                onClick={() => toggleBlockDone(selectedKey, blockIndex)}
                              >
                                ✓
                              </button>
                              <button
                                type="button"
                                className={`hour-row__status-btn hour-row__status-btn--fail${slotFailed ? " hour-row__status-btn--active" : ""}`}
                                disabled={!statusActionsEnabled || slotFailed}
                                aria-pressed={slotFailed}
                                aria-label="Отметить как невыполненную"
                                title={statusActionsEnabled ? "Не выполнено" : "Сначала запишите задачу"}
                                onClick={() => openFailReasonModal(selectedKey, blockIndex)}
                              >
                                ✕
                              </button>
                              {hasTask && !selectedIsPast && !slotFailed ? (
                                <button
                                  type="button"
                                  className="hour-row__status-btn hour-row__status-btn--delete"
                                  aria-label={`Удалить: ${note}`}
                                  title="Удалить задачу"
                                  onClick={() => {
                                    const idx = blockIndexForSlot(blocksForSelected, slot);
                                    deleteBlockTask(selectedKey, idx >= 0 ? idx : blockIndex);
                                  }}
                                >
                                  <span aria-hidden>⌫</span>
                                </button>
                              ) : null}
                            </div>
                            <div
                              className={`hour-row__field-shell${rowReadOnly ? " hour-row__field-shell--readonly" : ""}${slotFailed ? " hour-row__field-shell--failed" : ""}`}
                            >
                              <HourNoteField
                                key={`${selectedKey}-${blockIndex}`}
                                id={fieldId}
                                value={note}
                                readOnly={rowReadOnly}
                                ariaLabel={`План на ${formatScheduleRange(slot.startMin, slot.endMin)}`}
                                placeholder={
                                  slotFailed
                                    ? "Причина невыполнения зафиксирована"
                                    : selectedIsPast
                                      ? "Просмотр: редактирование недоступно"
                                      : slotPast
                                        ? "Этот интервал уже прошёл — только просмотр"
                                        : "Задачи, встречи и заметки на этот интервал…"
                                }
                                onChange={(text) => setBlockNote(selectedKey, blockIndex, text)}
                              />
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  });
                  })()}
                </ol>
                  </div>
                </>
              ) : (
                <div
                  id="day-modal-panel-work"
                  role="tabpanel"
                  aria-labelledby="day-modal-tab-work"
                  className="work-day-scroll"
                >
                  <form className="work-day-form" onSubmit={(e) => e.preventDefault()}>
                    <fieldset className="work-day-form__fieldset" disabled={selectedIsPast}>
                      <legend className="work-day-form__legend">Рабочий день</legend>

                      <div className="work-day-form__row">
                        <span className="work-day-form__label" id="work-day-time-label">
                          Время работы
                        </span>
                        <div className="work-day-form__time-range" aria-labelledby="work-day-time-label">
                          <label className="work-day-form__time-wrap">
                            <span className="work-day-form__time-caption">с</span>
                            <TimeField
                              allowEmpty
                              minuteStep={60}
                              value={selectedWorkDay.workStart}
                              readOnly={selectedIsPast}
                              aria-label="Начало работы"
                              onChange={(v) => updateWorkDayField("workStart", v)}
                            />
                          </label>
                          <label className="work-day-form__time-wrap">
                            <span className="work-day-form__time-caption">до</span>
                            <TimeField
                              allowEmpty
                              minuteStep={60}
                              value={selectedWorkDay.workEnd}
                              readOnly={selectedIsPast}
                              aria-label="Конец работы"
                              onChange={(v) => updateWorkDayField("workEnd", v)}
                            />
                          </label>
                        </div>
                      </div>

                      <label className="work-day-form__row work-day-form__row--stack">
                        <span className="work-day-form__label">Адрес работы</span>
                        <input
                          type="text"
                          className="work-day-form__text"
                          value={selectedWorkDay.address}
                          readOnly={selectedIsPast}
                          placeholder="Улица, офис, этаж…"
                          maxLength={200}
                          onChange={(e) => updateWorkDayField("address", e.target.value)}
                        />
                      </label>

                      <label className="work-day-form__row work-day-form__row--stack">
                        <span className="work-day-form__label">Время подъёма</span>
                        <TimeField
                          allowEmpty
                          minuteStep={5}
                          value={selectedWorkDay.wakeUp}
                          readOnly={selectedIsPast}
                          aria-label="Время подъёма"
                          onChange={(v) => updateWorkDayField("wakeUp", v)}
                        />
                      </label>

                      <label className="work-day-form__row work-day-form__row--stack">
                        <span className="work-day-form__label">Время возврата домой</span>
                        <TimeField
                          allowEmpty
                          minuteStep={5}
                          value={selectedWorkDay.returnHome}
                          readOnly={selectedIsPast}
                          aria-label="Время возврата домой"
                          onChange={(v) => updateWorkDayField("returnHome", v)}
                        />
                      </label>
                    </fieldset>
                    {selectedIsPast ? (
                      <p className="work-day-form__hint" role="status">
                        Просмотр — редактирование недоступно
                      </p>
                    ) : null}
                  </form>
                </div>
              )}

              {failReasonModal && failReasonModal.key === selectedKey ? (
                <div
                  className="fail-reason-modal"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="fail-reason-modal-title"
                >
                  <div className="fail-reason-modal__panel">
                    <h3 id="fail-reason-modal-title" className="fail-reason-modal__title">
                      Причина невыполнения
                    </h3>
                    <p className="fail-reason-modal__hint">
                      Текст попадёт в поле задачи и его нельзя будет изменить.
                    </p>
                    <textarea
                      className="fail-reason-modal__input"
                      autoFocus
                      rows={4}
                      value={failReasonDraft}
                      onChange={(e) => setFailReasonDraft(e.target.value)}
                      placeholder="Опишите, почему задача не выполнена…"
                      maxLength={500}
                      aria-label="Причина невыполнения"
                    />
                    <div className="fail-reason-modal__actions">
                      <button
                        type="button"
                        className="fail-reason-modal__btn fail-reason-modal__btn--primary"
                        disabled={!failReasonDraft.trim()}
                        onClick={confirmFailReason}
                      >
                        Зафиксировать
                      </button>
                      <button
                        type="button"
                        className="fail-reason-modal__btn fail-reason-modal__btn--secondary"
                        onClick={closeFailReasonModal}
                      >
                        Отмена
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
