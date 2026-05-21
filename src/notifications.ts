import {
  extractDayScheduleEntries,
  formatScheduleRange,
  parseScheduleTimeInput,
  scheduleDateKey,
  type DayBlock,
} from "./plannerDaySchedule";
import type { TaskItem } from "./plannerPlans";

export const NOTIF_BANNER_DISMISS_KEY = "mytodo-notif-banner-dismiss";
export const FIRED_NOTIF_PREFIX = "mytodo-fired-notif:";

export type ReminderCandidate = {
  dedupKey: string;
  triggerMin: number;
  title: string;
  body: string;
  tab: "tasks" | "planner";
};

export function isNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function getNotificationPermission(): NotificationPermission | "unsupported" {
  if (!isNotificationSupported()) return "unsupported";
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (!isNotificationSupported()) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  const result = await Notification.requestPermission();
  return result;
}

export function isBannerDismissed(): boolean {
  try {
    return localStorage.getItem(NOTIF_BANNER_DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

export function dismissNotificationBanner(): void {
  try {
    localStorage.setItem(NOTIF_BANNER_DISMISS_KEY, "1");
  } catch {
    /* ignore */
  }
}

function minutesNow(now: Date): number {
  return now.getHours() * 60 + now.getMinutes();
}

function wasFired(dedupKey: string): boolean {
  try {
    return localStorage.getItem(FIRED_NOTIF_PREFIX + dedupKey) === "1";
  } catch {
    return false;
  }
}

function markFired(dedupKey: string): void {
  try {
    localStorage.setItem(FIRED_NOTIF_PREFIX + dedupKey, "1");
  } catch {
    /* ignore */
  }
}

/** Удаляет отметки срабатывания не за сегодня. */
export function pruneOldFiredMarks(todayKey: string): void {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(FIRED_NOTIF_PREFIX)) continue;
      if (!key.includes(todayKey)) keysToRemove.push(key);
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

export function collectReminderCandidates(
  tasks: TaskItem[],
  scheduleNotes: Record<string, DayBlock[]>,
  now = new Date(),
): ReminderCandidate[] {
  const dateKey = scheduleDateKey(now);
  const out: ReminderCandidate[] = [];

  for (const task of tasks) {
    if (task.done || !task.remindAt) continue;
    const min = parseScheduleTimeInput(task.remindAt);
    if (min === null) continue;
    out.push({
      dedupKey: `task:${dateKey}:${task.id}:${min}`,
      triggerMin: min,
      title: "Задачка",
      body: task.text.trim(),
      tab: "tasks",
    });
  }

  const entries = extractDayScheduleEntries(scheduleNotes, dateKey);
  for (const entry of entries) {
    if (!entry.text.trim()) continue;
    out.push({
      dedupKey: `schedule:${dateKey}:${entry.id}:${entry.startMin}`,
      triggerMin: entry.startMin,
      title: "Расписание на день",
      body: `${formatScheduleRange(entry.startMin, entry.endMin)} — ${entry.text.trim()}`,
      tab: "planner",
    });
  }

  return out;
}

function isDueNow(triggerMin: number, nowMin: number): boolean {
  return nowMin === triggerMin;
}

async function showSystemNotification(
  candidate: ReminderCandidate,
): Promise<void> {
  const options: NotificationOptions = {
    body: candidate.body,
    tag: candidate.dedupKey,
    data: { tab: candidate.tab },
  };

  if ("serviceWorker" in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(candidate.title, options);
      return;
    } catch {
      /* fallback */
    }
  }

  new Notification(candidate.title, options);
}

/** Проверить и показать напоминания на текущую минуту. */
export async function processDueReminders(
  tasks: TaskItem[],
  scheduleNotes: Record<string, DayBlock[]>,
  now = new Date(),
): Promise<number> {
  if (!isNotificationSupported() || Notification.permission !== "granted") return 0;

  const todayKey = scheduleDateKey(now);
  pruneOldFiredMarks(todayKey);

  const nowMin = minutesNow(now);
  const candidates = collectReminderCandidates(tasks, scheduleNotes, now);
  let shown = 0;

  for (const candidate of candidates) {
    if (!isDueNow(candidate.triggerMin, nowMin)) continue;
    if (wasFired(candidate.dedupKey)) continue;

    try {
      await showSystemNotification(candidate);
      markFired(candidate.dedupKey);
      shown += 1;
    } catch {
      /* permission revoked mid-flight */
    }
  }

  return shown;
}

export function hasPendingReminders(
  tasks: TaskItem[],
  scheduleNotes: Record<string, DayBlock[]>,
): boolean {
  return collectReminderCandidates(tasks, scheduleNotes).length > 0;
}

export async function registerNotificationServiceWorker(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    /* dev / unsupported */
  }
}
