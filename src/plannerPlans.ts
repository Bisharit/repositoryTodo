import { parseScheduleTimeInput } from "./plannerDaySchedule";

export type PlanItem = {
  id: string;
  text: string;
  createdAt: number;
};

export const TASKS_STORAGE_KEY = "mytodo-tasks";

function normalizeRemindAt(raw: unknown): string | undefined {
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  const min = parseScheduleTimeInput(raw.trim());
  if (min === null) return undefined;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
export const DAY_PLANS_STORAGE_KEY = "mytodo-planner-day-plans";
export const FUTURE_PLANS_STORAGE_KEY = "mytodo-planner-future-plans";

export function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function loadPlanItems(key: string): PlanItem[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row): PlanItem | null => {
        if (typeof row !== "object" || row === null) return null;
        const o = row as Record<string, unknown>;
        const id = typeof o.id === "string" ? o.id : uid();
        const text = typeof o.text === "string" ? o.text : "";
        const createdAt = typeof o.createdAt === "number" ? o.createdAt : Date.now();
        return { id, text, createdAt };
      })
      .filter((x): x is PlanItem => x !== null && x.text.length > 0);
  } catch {
    return [];
  }
}

export type TaskItem = PlanItem & {
  done: boolean;
  /** Когда отмечена выполненной; для автоочистки на следующий день */
  doneAt?: number;
  /** Время напоминания (ЧЧ:ММ); уведомление будет подключено позже */
  remindAt?: string;
};

function startOfLocalDay(date = new Date()): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Удаляет выполненные задачи, отмеченные не сегодня (локальный календарный день). */
export function purgeExpiredDoneTasks(tasks: TaskItem[]): TaskItem[] {
  const todayStart = startOfLocalDay();
  return tasks.filter((t) => {
    if (!t.done) return true;
    const doneAt = typeof t.doneAt === "number" ? t.doneAt : t.createdAt;
    return doneAt >= todayStart;
  });
}

export function loadTasks(): TaskItem[] {
  try {
    const raw = localStorage.getItem(TASKS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const loaded = parsed
      .map((row): TaskItem | null => {
        if (typeof row !== "object" || row === null) return null;
        const o = row as Record<string, unknown>;
        const id = typeof o.id === "string" ? o.id : uid();
        const text = typeof o.text === "string" ? o.text : "";
        const done = Boolean(o.done);
        const createdAt = typeof o.createdAt === "number" ? o.createdAt : Date.now();
        const doneAt = typeof o.doneAt === "number" ? o.doneAt : done ? createdAt : undefined;
        const remindAt = normalizeRemindAt(o.remindAt);
        return { id, text, done, createdAt, doneAt, remindAt };
      })
      .filter((x): x is TaskItem => x !== null && x.text.length > 0);
    return purgeExpiredDoneTasks(loaded);
  } catch {
    return [];
  }
}
