import { useCallback, useState } from "react";
import {
  dismissNotificationBanner,
  getNotificationPermission,
  hasPendingReminders,
  isBannerDismissed,
  isNotificationSupported,
  requestNotificationPermission,
} from "./notifications";
import type { DayBlock } from "./plannerDaySchedule";
import type { TaskItem } from "./plannerPlans";
import "./NotificationBanner.css";

type NotificationBannerProps = {
  tasks: TaskItem[];
  scheduleNotes: Record<string, DayBlock[]>;
  onPermissionChange?: () => void;
};

export function NotificationBanner({
  tasks,
  scheduleNotes,
  onPermissionChange,
}: NotificationBannerProps) {
  const [hidden, setHidden] = useState(() => isBannerDismissed());
  const [busy, setBusy] = useState(false);

  const supported = isNotificationSupported();
  const permission = getNotificationPermission();

  const shouldShow =
    supported &&
    !hidden &&
    permission !== "granted" &&
    hasPendingReminders(tasks, scheduleNotes);

  const enable = useCallback(async () => {
    setBusy(true);
    const result = await requestNotificationPermission();
    setBusy(false);
    onPermissionChange?.();
    if (result === "granted") setHidden(true);
  }, [onPermissionChange]);

  const dismiss = useCallback(() => {
    dismissNotificationBanner();
    setHidden(true);
  }, []);

  if (!shouldShow && permission !== "denied") return null;

  if (permission === "denied" && !hidden) {
    return (
      <div className="notif-banner notif-banner--denied" role="status">
        <p className="notif-banner__text">
          Уведомления заблокированы в настройках браузера. Разрешите их для этого сайта, чтобы
          получать напоминания.
        </p>
        <button type="button" className="notif-banner__dismiss" onClick={dismiss}>
          Скрыть
        </button>
      </div>
    );
  }

  if (!shouldShow) return null;

  return (
    <div className="notif-banner" role="region" aria-label="Включение уведомлений">
      <div className="notif-banner__content">
        <p className="notif-banner__title">Напоминания на этом устройстве</p>
        <p className="notif-banner__text">
          Включите уведомления — приложение напомнит о задачках и интервалах из расписания на
          сегодня, пока вкладка открыта (или приложение добавлено на главный экран).
        </p>
      </div>
      <div className="notif-banner__actions">
        <button
          type="button"
          className="notif-banner__enable"
          disabled={busy}
          onClick={() => void enable()}
        >
          {busy ? "Запрос…" : "Включить"}
        </button>
        <button type="button" className="notif-banner__dismiss" onClick={dismiss}>
          Позже
        </button>
      </div>
    </div>
  );
}
