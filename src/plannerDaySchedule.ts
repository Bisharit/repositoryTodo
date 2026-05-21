export const SCHEDULE_STORAGE_KEY = "mytodo-planner-day-hours";

const HOURS = Array.from({ length: 24 }, (_, i) => i);
export const DAY_END_MIN = 24 * 60;
const DEFAULT_SLOT_COUNT = 24;
export type BlockStatus = "open" | "done" | "failed";

/** Конец пустого интервала — ближайший следующий полный час (19:20 → 20:00, 18:00 → 19:00). */
function endAtNextHourBoundary(startMin: number): number {
  if (startMin >= DAY_END_MIN) return DAY_END_MIN;
  const onHour = startMin % 60 === 0;
  const hourEnd = onHour ? startMin + 60 : Math.ceil(startMin / 60) * 60;
  return Math.min(hourEnd, DAY_END_MIN);
}

export type DayBlock = { endMin: number; text: string; status?: BlockStatus };

export type DaySlot = { startMin: number; endMin: number; text: string; status: BlockStatus };

export type DayScheduleEntry = {
  id: string;
  startMin: number;
  endMin: number;
  text: string;
  status: BlockStatus;
};

export function blockStatus(block: DayBlock | undefined): BlockStatus {
  if (block?.status === "done" || block?.status === "failed") return block.status;
  return "open";
}

function blockText(block: DayBlock | undefined): string {
  return typeof block?.text === "string" ? block.text : "";
}

export function defaultDayBlocks(): DayBlock[] {
  return HOURS.map((h) => ({ endMin: (h + 1) * 60, text: "" }));
}

function migrateLegacyHours(raw: string[]): DayBlock[] {
  return HOURS.map((h, i) => ({
    endMin: (h + 1) * 60,
    text: typeof raw[i] === "string" ? raw[i] : "",
  }));
}

/** Базовый конец пустого интервала до следующего часа, не заходя на занятую задачу. */
function defaultEndForEmptySlot(slots: DaySlot[], index: number): number {
  const start = slots[index]?.startMin ?? 0;
  let end = endAtNextHourBoundary(start);
  for (let j = index + 1; j < slots.length; j++) {
    if ((slots[j].text ?? "").trim()) {
      end = Math.min(end, slots[j].startMin);
      break;
    }
  }
  return Math.max(start + 1, end);
}

function finalizeEmptySlotEnds(blocks: DayBlock[]): DayBlock[] {
  let slots = blocksToSlots(blocks);
  const adjusted = blocks.map((b, i) => {
    if (!blockText(b).trim() && blockStatus(b) !== "failed") {
      return { ...b, endMin: defaultEndForEmptySlot(slots, i) };
    }
    return b;
  });
  slots = blocksToSlots(adjusted);
  let start = 0;
  return adjusted.map((b) => {
    if (start >= DAY_END_MIN) {
      return { ...b, endMin: DAY_END_MIN, text: "", status: "open" as BlockStatus };
    }
    const end = Math.max(start + 1, Math.min(b.endMin, DAY_END_MIN));
    const row = { ...b, endMin: end };
    start = end;
    return row;
  });
}

export function normalizeDayBlocks(blocks: DayBlock[]): DayBlock[] {
  let start = 0;
  const out: DayBlock[] = [];
  const source = blocks.length === DEFAULT_SLOT_COUNT ? blocks : defaultDayBlocks();

  for (let i = 0; i < DEFAULT_SLOT_COUNT; i++) {
    const text = blockText(source[i]);
    const status = blockStatus(source[i]);
    let end = typeof source[i]?.endMin === "number" ? source[i].endMin : endAtNextHourBoundary(start);

    if (!text.trim() && status !== "failed") {
      end = endAtNextHourBoundary(start);
    } else {
      end = Math.max(start + 1, Math.min(end, DAY_END_MIN));
    }

    out.push({ endMin: end, text, status });
    start = end;
    if (start >= DAY_END_MIN) {
      for (let j = i + 1; j < DEFAULT_SLOT_COUNT; j++) {
        out.push({
          endMin: DAY_END_MIN,
          text: "",
          status: "open",
        });
      }
      return finalizeEmptySlotEnds(out);
    }
  }
  return finalizeEmptySlotEnds(out);
}

/** Очистить задачу и вернуть интервал к базовой длительности, если время не занято. */
export function clearBlockIntervalAt(blocks: DayBlock[], index: number): DayBlock[] {
  const base = [...normalizeDaySchedule(blocks)];
  const block = base[index];
  if (!block || blockStatus(block) === "failed") return base;

  const slots = blocksToSlots(base);
  const end = defaultEndForEmptySlot(slots, index);
  base[index] = { text: "", status: "open", endMin: end };
  return normalizeDayBlocks(base);
}

/** Явное удаление задачи (в т.ч. из прошедшего интервала сегодня). */
export function removeBlockTaskAt(blocks: DayBlock[], index: number): DayBlock[] {
  const base = [...normalizeDaySchedule(blocks)];
  if (!base[index]) return base;

  const slots = blocksToSlots(base);
  const end = defaultEndForEmptySlot(slots, index);
  base[index] = { text: "", status: "open", endMin: end };
  return normalizeDayBlocks(base);
}

/** Индекс блока по видимому интервалу (на случай рассинхрона цепочки). */
export function blockIndexForSlot(blocks: DayBlock[], slot: DaySlot): number {
  const normalized = normalizeDaySchedule(blocks);
  const slots = blocksToSlots(normalized);
  const idx = slots.findIndex((s) => s.startMin === slot.startMin && s.endMin === slot.endMin);
  if (idx >= 0) return idx;
  const withText = slots.findIndex(
    (s, i) =>
      (s.text ?? "").trim() === (slot.text ?? "").trim() &&
      s.startMin === slot.startMin &&
      normalized[i],
  );
  return withText >= 0 ? withText : -1;
}

/** Установить конец интервала с учётом занятых соседних задач. */
export function setBlockEndInDay(blocks: DayBlock[], index: number, endMin: number): DayBlock[] {
  const base = [...normalizeDaySchedule(blocks)];
  const slots = blocksToSlots(base);
  const slot = slots[index];
  if (!slot) return base;

  let clamped = Math.max(slot.startMin + 1, Math.min(endMin, DAY_END_MIN));
  for (let j = index + 1; j < slots.length; j++) {
    if ((slots[j].text ?? "").trim()) {
      clamped = Math.min(clamped, slots[j].startMin);
      break;
    }
  }

  const block = base[index];
  if (!block || blockStatus(block) === "failed" || !blockText(block).trim()) return base;

  base[index] = { ...block, endMin: clamped };
  return normalizeDayBlocks(base);
}

export function normalizeDaySchedule(raw: unknown): DayBlock[] {
  if (!Array.isArray(raw) || raw.length !== DEFAULT_SLOT_COUNT) return defaultDayBlocks();
  if (typeof raw[0] === "string") return normalizeDayBlocks(migrateLegacyHours(raw as string[]));
  if (raw[0] && typeof raw[0] === "object" && raw[0] !== null && "endMin" in (raw[0] as object)) {
    return normalizeDayBlocks(raw as DayBlock[]);
  }
  return defaultDayBlocks();
}

/** Строит цепочку интервалов из блоков без повторной нормализации (избегает рекурсии). */
export function blocksToSlots(blocks: DayBlock[]): DaySlot[] {
  const source = blocks.length === DEFAULT_SLOT_COUNT ? blocks : defaultDayBlocks();
  let start = 0;
  const slots: DaySlot[] = [];
  for (const b of source) {
    if (start >= DAY_END_MIN) break;
    const end = Math.max(start + 1, Math.min(b.endMin, DAY_END_MIN));
    slots.push({ startMin: start, endMin: end, text: blockText(b), status: blockStatus(b) });
    start = end;
  }
  return slots;
}

const CLEAR_TODAY_FLAG = "mytodo-schedule-cleared-today-v1";

export function loadScheduleNotes(): Record<string, DayBlock[]> {
  try {
    const raw = localStorage.getItem(SCHEDULE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) return {};
    const out: Record<string, DayBlock[]> = {};
    for (const [k, v] of Object.entries(parsed)) {
      out[k] = normalizeDaySchedule(v);
    }
    if (typeof localStorage !== "undefined" && localStorage.getItem(CLEAR_TODAY_FLAG) !== "1") {
      const todayKey = scheduleDateKey(new Date());
      delete out[todayKey];
      localStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify(out));
      localStorage.setItem(CLEAR_TODAY_FLAG, "1");
    }
    return out;
  } catch {
    return {};
  }
}

export function scheduleDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatScheduleTime(min: number): string {
  const clamped = Math.max(0, Math.min(min, DAY_END_MIN - 1));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export type VisibleScheduleSlot = { slot: DaySlot; blockIndex: number };

type TimeRange = { start: number; end: number };

export type WorkDayScheduleMask = {
  wakeUp?: string;
  returnHome?: string;
};

/** Парсинг поля времени «ЧЧ:ММ» в минуты от полуночи. */
export function parseScheduleTimeInput(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mi) || h < 0 || h > 23 || mi < 0 || mi > 59) return null;
  return h * 60 + mi;
}

/**
 * Интервалы, где пустые окошки расписания скрыты (как внутри задачи):
 * с подъёма до возврата домой. До подъёма и после возврата слоты остаются свободными.
 */
export function homeRoutineHiddenRanges(wakeUp: string, returnHome: string): TimeRange[] {
  const wake = parseScheduleTimeInput(wakeUp);
  const ret = parseScheduleTimeInput(returnHome);

  if (wake !== null && ret !== null) {
    if (wake === ret) return [];
    if (wake < ret) return [{ start: wake, end: ret }];
    return [
      { start: wake, end: DAY_END_MIN },
      { start: 0, end: ret },
    ];
  }

  if (wake !== null) return [{ start: wake, end: DAY_END_MIN }];
  if (ret !== null) return [{ start: 0, end: ret }];
  return [];
}

/** Пустой интервал полностью внутри занятого диапазона (задача или «дома»). */
function isEmptySlotInsideOccupied(slot: DaySlot, occupiedRanges: TimeRange[]): boolean {
  if ((slot.text ?? "").trim() || slot.status === "failed") return false;
  return occupiedRanges.some(
    (t) => slot.startMin >= t.start && slot.endMin <= t.end && (slot.startMin > t.start || slot.endMin < t.end),
  );
}

/** Слоты для UI: скрыть пустые окошки внутри задач и между подъёмом и возвратом домой. */
export function visibleScheduleSlots(blocks: DayBlock[], workDay?: WorkDayScheduleMask): VisibleScheduleSlot[] {
  const normalized = normalizeDaySchedule(blocks);
  let start = 0;
  const all: VisibleScheduleSlot[] = [];

  for (let blockIndex = 0; blockIndex < normalized.length; blockIndex++) {
    if (start >= DAY_END_MIN) break;
    const b = normalized[blockIndex];
    const end = Math.max(start + 1, Math.min(b.endMin, DAY_END_MIN));
    all.push({
      blockIndex,
      slot: { startMin: start, endMin: end, text: blockText(b), status: blockStatus(b) },
    });
    start = end;
  }

  const taskRanges: TimeRange[] = all
    .filter(({ slot }) => (slot.text ?? "").trim())
    .map(({ slot }) => ({ start: slot.startMin, end: slot.endMin }));

  const homeRanges = homeRoutineHiddenRanges(workDay?.wakeUp ?? "", workDay?.returnHome ?? "");
  const occupiedRanges = [...taskRanges, ...homeRanges];

  const visible = all.filter(({ slot }) => !isEmptySlotInsideOccupied(slot, occupiedRanges));

  if (visible.length > 0) return visible;

  const defaults = defaultDayBlocks();
  let s = 0;
  const fallback: VisibleScheduleSlot[] = [];
  for (let blockIndex = 0; blockIndex < defaults.length; blockIndex++) {
    if (s >= DAY_END_MIN) break;
    const end = Math.max(s + 1, Math.min(defaults[blockIndex].endMin, DAY_END_MIN));
    fallback.push({
      blockIndex,
      slot: { startMin: s, endMin: end, text: "", status: "open" },
    });
    s = end;
  }
  return fallback;
}

export function formatScheduleRange(startMin: number, endMin: number): string {
  return `${formatScheduleTime(startMin)} — ${formatScheduleTime(endMin)}`;
}

/** Суммарная длительность интервалов с текстом (минуты). */
export function countDayScheduledMinutes(blocks: DayBlock[] | undefined): number {
  if (!blocks?.length) return 0;
  const slots = blocksToSlots(normalizeDaySchedule(blocks));
  return slots.reduce((sum, slot) => {
    if (!(slot.text ?? "").trim()) return sum;
    return sum + (slot.endMin - slot.startMin);
  }, 0);
}

export type DayOccupancyTone = "green" | "orange" | "red";

/** До 6 ч — зелёный, 7–10 ч — оранжевый, от 11 ч — красный. */
export function dayOccupancyTone(totalMinutes: number): DayOccupancyTone | null {
  if (totalMinutes <= 0) return null;
  if (totalMinutes >= 11 * 60) return "red";
  if (totalMinutes >= 7 * 60) return "orange";
  return "green";
}

/** Суммарные минуты интервала подъём → возврат домой (скрытая часть расписания). */
export function countWorkRoutineMinutes(wakeUp: string, returnHome: string): number {
  return homeRoutineHiddenRanges(wakeUp, returnHome).reduce((sum, r) => sum + (r.end - r.start), 0);
}

/** Подъём → домой: до 7 ч зелёный, 8–10 ч оранжевый, от 11 ч красный. */
export function workRoutineOccupancyTone(totalMinutes: number): DayOccupancyTone | null {
  if (totalMinutes <= 0) return null;
  if (totalMinutes >= 11 * 60) return "red";
  if (totalMinutes >= 8 * 60) return "orange";
  if (totalMinutes <= 7 * 60) return "green";
  return "orange";
}

export function formatOccupancyDuration(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} мин`;
  if (m === 0) return `${h} ч`;
  return `${h} ч ${m} мин`;
}

/** Задачи с текстом из расписания календаря на указанный день. */
export function extractDayScheduleEntries(
  notesByDay: Record<string, DayBlock[]>,
  dayKey: string,
): DayScheduleEntry[] {
  const blocks = notesByDay[dayKey];
  if (!blocks) return [];
  return blocksToSlots(normalizeDaySchedule(blocks))
    .map((slot, index) => ({ slot, index }))
    .filter(({ slot }) => (slot.text ?? "").trim().length > 0)
    .map(({ slot, index }) => ({
      id: `${dayKey}-${index}`,
      startMin: slot.startMin,
      endMin: slot.endMin,
      text: slot.text.trim(),
      status: slot.status,
    }))
    .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
}
