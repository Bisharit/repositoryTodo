import { useEffect, useRef } from "react";
import type { DayBlock } from "./plannerDaySchedule";
import {
  getNotificationPermission,
  processDueReminders,
  registerNotificationServiceWorker,
} from "./notifications";
import type { TaskItem } from "./plannerPlans";

const CHECK_INTERVAL_MS = 30_000;

export type NotificationTab = "tasks" | "planner";

type UseReminderNotificationsOptions = {
  tasks: TaskItem[];
  scheduleNotes: Record<string, DayBlock[]>;
  onNotificationTab?: (tab: NotificationTab) => void;
};

export function useReminderNotifications({
  tasks,
  scheduleNotes,
  onNotificationTab,
}: UseReminderNotificationsOptions): void {
  const tasksRef = useRef(tasks);
  const scheduleRef = useRef(scheduleNotes);
  const onTabRef = useRef(onNotificationTab);

  tasksRef.current = tasks;
  scheduleRef.current = scheduleNotes;
  onTabRef.current = onNotificationTab;

  useEffect(() => {
    registerNotificationServiceWorker();

    const runCheck = () => {
      if (getNotificationPermission() !== "granted") return;
      void processDueReminders(tasksRef.current, scheduleRef.current);
    };

    runCheck();
    const id = window.setInterval(runCheck, CHECK_INTERVAL_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") runCheck();
    };
    document.addEventListener("visibilitychange", onVisible);

    const onSwMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; tab?: NotificationTab } | undefined;
      if (data?.type === "NOTIFICATION_CLICK" && data.tab) {
        onTabRef.current?.(data.tab);
      }
    };

    navigator.serviceWorker?.addEventListener("message", onSwMessage);

    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      navigator.serviceWorker?.removeEventListener("message", onSwMessage);
    };
  }, []);

  useEffect(() => {
    if (getNotificationPermission() !== "granted") return;
    void processDueReminders(tasks, scheduleNotes);
  }, [tasks, scheduleNotes]);
}
