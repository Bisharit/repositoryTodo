import { scheduleDateKey } from "./plannerDaySchedule";
import { uid } from "./plannerPlans";

export const OBLIGATIONS_STORAGE_KEY = "mytodo-obligations";

export type ObligationItem = {
  id: string;
  text: string;
  createdAt: number;
  /** День (YYYY-MM-DD), когда отмечено выполненным; на следующий день снова в работе */
  doneDayKey?: string;
  /** Запланированное время на выполнение (минуты), необязательно */
  durationMin?: number;
};

function normalizeDurationMin(raw: unknown): number | undefined {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return undefined;
  const n = Math.round(raw);
  if (n < 1 || n > 24 * 60) return undefined;
  return n;
}

export function isObligationDoneToday(item: ObligationItem, now = new Date()): boolean {
  return item.doneDayKey === scheduleDateKey(now);
}

export function loadObligations(): ObligationItem[] {
  try {
    const raw = localStorage.getItem(OBLIGATIONS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row): ObligationItem | null => {
        if (typeof row !== "object" || row === null) return null;
        const o = row as Record<string, unknown>;
        const id = typeof o.id === "string" ? o.id : uid();
        const text = typeof o.text === "string" ? o.text.trim() : "";
        const createdAt = typeof o.createdAt === "number" ? o.createdAt : Date.now();
        const doneDayKey = typeof o.doneDayKey === "string" ? o.doneDayKey : undefined;
        const durationMin = normalizeDurationMin(o.durationMin);
        if (!text) return null;
        return { id, text, createdAt, doneDayKey, durationMin };
      })
      .filter((x): x is ObligationItem => x !== null);
  } catch {
    return [];
  }
}

export function createObligation(text: string, durationMin?: number): ObligationItem {
  return {
    id: uid(),
    text: text.trim(),
    createdAt: Date.now(),
    durationMin: durationMin && durationMin > 0 ? Math.round(durationMin) : undefined,
  };
}
