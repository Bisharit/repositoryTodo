import { useCallback, useId, useMemo, useState, type KeyboardEvent } from "react";
import { TimeField } from "./TimeField";
import { uid, type TaskItem } from "./plannerPlans";
import "./TasksPanel.css";

type TasksPanelProps = {
  tasks: TaskItem[];
  onTasksChange: (tasks: TaskItem[] | ((prev: TaskItem[]) => TaskItem[])) => void;
  onMoveToFuturePlans: (id: string) => void;
};

export function TasksPanel({ tasks, onTasksChange, onMoveToFuturePlans }: TasksPanelProps) {
  const fieldId = useId();
  const remindFieldId = useId();
  const [draft, setDraft] = useState("");
  const [draftRemindAt, setDraftRemindAt] = useState("");

  const pendingCount = useMemo(() => tasks.filter((t) => !t.done).length, [tasks]);

  const addTask = useCallback(() => {
    const text = draft.trim();
    if (!text) return;
    const remindAt = draftRemindAt.trim() || undefined;
    onTasksChange((prev) => [
      { id: uid(), text, done: false, createdAt: Date.now(), remindAt },
      ...prev,
    ]);
    setDraft("");
    setDraftRemindAt("");
  }, [draft, draftRemindAt, onTasksChange]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        addTask();
      }
    },
    [addTask],
  );

  const toggleDone = useCallback(
    (id: string) => {
      onTasksChange((prev) =>
        prev.map((t) => {
          if (t.id !== id) return t;
          if (t.done) return { ...t, done: false, doneAt: undefined };
          return { ...t, done: true, doneAt: Date.now() };
        }),
      );
    },
    [onTasksChange],
  );

  const markForPlanner = useCallback(
    (id: string) => {
      onMoveToFuturePlans(id);
    },
    [onMoveToFuturePlans],
  );

  const removeTask = useCallback(
    (id: string) => {
      onTasksChange((prev) => prev.filter((t) => t.id !== id));
    },
    [onTasksChange],
  );

  const setTaskRemindAt = useCallback(
    (id: string, remindAt: string) => {
      onTasksChange((prev) =>
        prev.map((t) => {
          if (t.id !== id) return t;
          const next = remindAt.trim();
          return { ...t, remindAt: next || undefined };
        }),
      );
    },
    [onTasksChange],
  );

  return (
    <div className="tasks-panel">
      <header className="tasks-panel__hero">
        <div className="tasks-panel__hero-glow" aria-hidden />
        <div className="tasks-panel__hero-inner">
          <h1 className="tasks-panel__title">Задачки</h1>
          <p className="tasks-panel__subtitle">
            {pendingCount > 0
              ? `${pendingCount} ${pendingLabel(pendingCount)} в работе`
              : "Всё сделано — можно добавить новое"}
          </p>
        </div>
      </header>

      <div className="tasks-composer">
        <div className="tasks-composer__accent" aria-hidden />
        <label className="tasks-composer__label" htmlFor={fieldId}>
          Новая задача
        </label>
        <textarea
          id={fieldId}
          className="tasks-composer__field"
          rows={3}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="О чём не забыть: звонок, покупка, письмо…"
          spellCheck
        />
        <div className="tasks-composer__remind">
          <span className="tasks-composer__remind-label" id={remindFieldId}>
            Напомнить в
          </span>
          <TimeField
            allowEmpty
            minuteStep={5}
            size="comfortable"
            value={draftRemindAt}
            aria-label="Время напоминания для новой задачи"
            onChange={setDraftRemindAt}
          />
          <span className="tasks-composer__remind-hint">необязательно</span>
        </div>
        <div className="tasks-composer__toolbar">
          <p className="tasks-composer__hint">
            <kbd className="tasks-kbd">Ctrl</kbd>
            <span className="tasks-composer__hint-slash"> или </span>
            <kbd className="tasks-kbd">⌘</kbd>
            <span className="tasks-composer__hint-plus">+</span>
            <kbd className="tasks-kbd">Enter</kbd>
            <span className="tasks-composer__hint-text"> — добавить</span>
          </p>
          <button type="button" className="tasks-composer__submit" onClick={addTask} disabled={!draft.trim()}>
            <span className="tasks-composer__submit-icon" aria-hidden>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M9 3.5v11M3.5 9h11"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            Добавить
          </button>
        </div>
      </div>

      <div className="tasks-panel__list-wrap">
        {tasks.length === 0 ? (
          <div className="tasks-empty" role="status">
            <div className="tasks-empty__orb tasks-empty__orb--a" aria-hidden />
            <div className="tasks-empty__orb tasks-empty__orb--b" aria-hidden />
            <p className="tasks-empty__text">Пока пусто — запишите первую задачу выше</p>
          </div>
        ) : (
          <ul className="tasks-list" aria-label="Список задач">
            {tasks.map((t) => (
              <li key={t.id} className={`tasks-list__item${t.done ? " tasks-list__item--done" : ""}`}>
                <label className="tasks-list__check-wrap">
                  <input
                    type="checkbox"
                    className="tasks-list__checkbox"
                    checked={t.done}
                    onChange={() => toggleDone(t.id)}
                    aria-label={t.done ? `Вернуть в работу: ${t.text}` : `Отметить выполненной: ${t.text}`}
                  />
                  <span className="tasks-list__check-ui" aria-hidden />
                </label>
                {!t.done ? (
                  <button
                    type="button"
                    className="tasks-list__move"
                    onClick={() => markForPlanner(t.id)}
                    aria-label={`Перенести в планёр: ${t.text}`}
                    title="В планёр"
                  >
                    <span className="tasks-list__move-icon" aria-hidden>
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path
                          d="M3 8h8M8.5 4.5L12 8l-3.5 3.5"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                    <span className="tasks-list__move-label">Планёр</span>
                  </button>
                ) : (
                  <span className="tasks-list__move-spacer" aria-hidden />
                )}
                <div className="tasks-list__body">
                  <p className="tasks-list__text">{t.text}</p>
                  <div className="tasks-list__remind">
                    <span className="tasks-list__remind-label">Напомнить</span>
                    <TimeField
                      allowEmpty
                      minuteStep={5}
                      size="compact"
                      value={t.remindAt ?? ""}
                      disabled={t.done}
                      aria-label={`Время напоминания: ${t.text}`}
                      onChange={(v) => setTaskRemindAt(t.id, v)}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  className="tasks-list__remove"
                  onClick={() => removeTask(t.id)}
                  aria-label={`Удалить: ${t.text}`}
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

function pendingLabel(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m100 >= 11 && m100 <= 14) return "задач";
  if (m10 === 1) return "задача";
  if (m10 >= 2 && m10 <= 4) return "задачи";
  return "задач";
}
