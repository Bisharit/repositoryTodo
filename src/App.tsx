import { useCallback, useEffect, useMemo, useState } from "react";
import { NotificationBanner } from "./NotificationBanner";
import { PlannerAside, type PlannerAsideTab } from "./PlannerAside";
import { PlannerCalendar } from "./PlannerCalendar";
import { ObligationsPanel } from "./ObligationsPanel";
import { TasksPanel } from "./TasksPanel";
import { useReminderNotifications } from "./useReminderNotifications";
import { loadObligations, OBLIGATIONS_STORAGE_KEY, type ObligationItem } from "./obligations";
import {
  extractDayScheduleEntries,
  loadScheduleNotes,
  scheduleDateKey,
  type DayBlock,
} from "./plannerDaySchedule";
import {
  FUTURE_PLANS_STORAGE_KEY,
  TASKS_STORAGE_KEY,
  loadPlanItems,
  loadTasks,
  purgeExpiredDoneTasks,
  type PlanItem,
  type TaskItem,
} from "./plannerPlans";
import "./App.css";

type TabId = "tasks" | "planner" | "obligations";

const TABS: { id: TabId; label: string }[] = [
  { id: "tasks", label: "Задачки" },
  { id: "planner", label: "Планёр" },
  { id: "obligations", label: "Обязаловка" },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>("tasks");
  const [tasks, setTasks] = useState<TaskItem[]>(loadTasks);
  const [scheduleNotes, setScheduleNotes] = useState<Record<string, DayBlock[]>>(loadScheduleNotes);
  const [futurePlans, setFuturePlans] = useState<PlanItem[]>(() => loadPlanItems(FUTURE_PLANS_STORAGE_KEY));
  const [obligations, setObligations] = useState<ObligationItem[]>(loadObligations);
  const [plannerAsideTab, setPlannerAsideTab] = useState<PlannerAsideTab>("day");
  const [, setDayTick] = useState(0);
  const [notifBannerRev, setNotifBannerRev] = useState(0);

  useReminderNotifications({
    tasks,
    scheduleNotes,
    onNotificationTab: (tab) => {
      setActiveTab(tab);
      if (tab === "planner") setPlannerAsideTab("day");
    },
  });

  const todayScheduleEntries = useMemo(() => {
    const todayKey = scheduleDateKey(new Date());
    return extractDayScheduleEntries(scheduleNotes, todayKey);
  }, [scheduleNotes]);

  useEffect(() => {
    localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(tasks));
  }, [tasks]);

  useEffect(() => {
    const tick = () => {
      setTasks((prev) => purgeExpiredDoneTasks(prev));
      setDayTick((n) => n + 1);
    };
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    localStorage.setItem(OBLIGATIONS_STORAGE_KEY, JSON.stringify(obligations));
  }, [obligations]);

  useEffect(() => {
    localStorage.setItem(FUTURE_PLANS_STORAGE_KEY, JSON.stringify(futurePlans));
  }, [futurePlans]);

  const moveTaskToFuturePlans = useCallback((id: string) => {
    setTasks((prev) => {
      const task = prev.find((t) => t.id === id);
      if (!task || task.done) return prev;
      const plan: PlanItem = { id: task.id, text: task.text, createdAt: task.createdAt };
      setFuturePlans((fp) => [plan, ...fp.filter((p) => p.id !== plan.id)]);
      setPlannerAsideTab("future");
      return prev.filter((t) => t.id !== id);
    });
  }, []);

  const removeFuturePlan = useCallback((id: string) => {
    setFuturePlans((prev) => prev.filter((p) => p.id !== id));
  }, []);

  return (
    <div className={activeTab === "planner" ? "app app--planner-split" : "app"}>
      <main className="app__main">
        <NotificationBanner
          key={notifBannerRev}
          tasks={tasks}
          scheduleNotes={scheduleNotes}
          onPermissionChange={() => setNotifBannerRev((n) => n + 1)}
        />
        {activeTab === "tasks" && (
          <section
            id="panel-tasks"
            role="tabpanel"
            aria-labelledby="tab-tasks"
            className="panel panel--tasks"
          >
            <TasksPanel tasks={tasks} onTasksChange={setTasks} onMoveToFuturePlans={moveTaskToFuturePlans} />
          </section>
        )}
        {activeTab === "planner" && (
          <section
            id="panel-planner"
            role="tabpanel"
            aria-labelledby="tab-planner"
            className="panel panel--planner"
          >
            <div className="planner-layout__calendar">
              <PlannerCalendar onNotesByDayChange={setScheduleNotes} />
            </div>
            <aside className="planner-layout__aside" aria-label="Планы">
              <PlannerAside
                activeTab={plannerAsideTab}
                onTabChange={setPlannerAsideTab}
                todayScheduleEntries={todayScheduleEntries}
                futurePlans={futurePlans}
                onRemoveFuturePlan={removeFuturePlan}
              />
            </aside>
          </section>
        )}
        {activeTab === "obligations" && (
          <section
            id="panel-obligations"
            role="tabpanel"
            aria-labelledby="tab-obligations"
            className="panel panel--obligations"
          >
            <ObligationsPanel items={obligations} onItemsChange={setObligations} />
          </section>
        )}
      </main>

      <nav className="tabs app__nav" aria-label="Разделы приложения">
        <div className="tabs__list" role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={activeTab === tab.id}
              aria-controls={`panel-${tab.id}`}
              tabIndex={activeTab === tab.id ? 0 : -1}
              className={`tabs__btn${activeTab === tab.id ? " tabs__btn--active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
