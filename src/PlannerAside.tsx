import { TimeDisplay } from "./TimeField";
import {
  formatScheduleRange,
  formatScheduleTime,
  type DayScheduleEntry,
} from "./plannerDaySchedule";
import type { PlanItem } from "./plannerPlans";
import "./PlannerAside.css";

export type PlannerAsideTab = "day" | "future";

const TABS: { id: PlannerAsideTab; label: string }[] = [
  { id: "day", label: "планы на день" },
  { id: "future", label: "будущие планы" },
];

const STATUS_LABELS: Record<DayScheduleEntry["status"], string> = {
  open: "",
  done: "Выполнено",
  failed: "Не выполнено",
};

type PlannerAsideProps = {
  activeTab: PlannerAsideTab;
  onTabChange: (tab: PlannerAsideTab) => void;
  todayScheduleEntries: DayScheduleEntry[];
  futurePlans: PlanItem[];
  onRemoveFuturePlan: (id: string) => void;
};

export function PlannerAside({
  activeTab,
  onTabChange,
  todayScheduleEntries,
  futurePlans,
  onRemoveFuturePlan,
}: PlannerAsideProps) {
  return (
    <div className="planner-aside">
      <div className="planner-aside__tabs" role="tablist" aria-label="Разделы планов">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`planner-aside-tab-${tab.id}`}
            aria-selected={activeTab === tab.id}
            aria-controls={`planner-aside-panel-${tab.id}`}
            tabIndex={activeTab === tab.id ? 0 : -1}
            className={`planner-aside__tab${activeTab === tab.id ? " planner-aside__tab--active" : ""}`}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div
        id={`planner-aside-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`planner-aside-tab-${activeTab}`}
        className="planner-aside__panel"
      >
        {activeTab === "day" ? (
          todayScheduleEntries.length === 0 ? (
            <p className="planner-aside__empty" role="status">
              Запишите задачи в расписании на сегодня — они появятся здесь
            </p>
          ) : (
            <ul className="planner-aside__list" aria-label="Планы на сегодня из расписания">
              {todayScheduleEntries.map((entry) => {
                const statusLabel = STATUS_LABELS[entry.status];
                return (
                  <li
                    key={entry.id}
                    className={`planner-aside__item planner-aside__item--schedule planner-aside__item--${entry.status}`}
                  >
                    <div className="planner-aside__schedule-body">
                      <p className="planner-aside__time">
                        <TimeDisplay className="planner-aside__time-start">
                          {formatScheduleTime(entry.startMin)}
                        </TimeDisplay>
                        <span className="planner-aside__time-sep" aria-hidden>
                          —
                        </span>
                        <TimeDisplay className="planner-aside__time-end">
                          {formatScheduleTime(entry.endMin)}
                        </TimeDisplay>
                      </p>
                      <p className="planner-aside__text">{entry.text}</p>
                      {statusLabel ? (
                        <span className={`planner-aside__status planner-aside__status--${entry.status}`}>
                          {statusLabel}
                        </span>
                      ) : null}
                    </div>
                    <span className="planner-aside__mirror" title={formatScheduleRange(entry.startMin, entry.endMin)}>
                      из календаря
                    </span>
                  </li>
                );
              })}
            </ul>
          )
        ) : futurePlans.length === 0 ? (
          <p className="planner-aside__empty" role="status">
            Отметьте задачу во вкладке «Задачки» — она появится здесь
          </p>
        ) : (
          <ul className="planner-aside__list" aria-label="Будущие планы">
            {futurePlans.map((item) => (
              <li key={item.id} className="planner-aside__item">
                <p className="planner-aside__text">{item.text}</p>
                <button
                  type="button"
                  className="planner-aside__remove"
                  onClick={() => onRemoveFuturePlan(item.id)}
                  aria-label={`Удалить: ${item.text}`}
                >
                  <span aria-hidden>×</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
