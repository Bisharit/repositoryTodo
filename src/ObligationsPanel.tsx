import { useCallback, useId, useMemo, useState, type KeyboardEvent } from "react";
import { DurationField } from "./DurationField";
import { createObligation, isObligationDoneToday, type ObligationItem } from "./obligations";
import { scheduleDateKey } from "./plannerDaySchedule";
import "./TasksPanel.css";
import "./ObligationsPanel.css";

type ObligationsPanelProps = {
  items: ObligationItem[];
  onItemsChange: (items: ObligationItem[] | ((prev: ObligationItem[]) => ObligationItem[])) => void;
};

export function ObligationsPanel({ items, onItemsChange }: ObligationsPanelProps) {
  const fieldId = useId();
  const durationFieldId = useId();
  const [draft, setDraft] = useState("");
  const [draftDurationMin, setDraftDurationMin] = useState<number | undefined>(undefined);
  const todayKey = scheduleDateKey(new Date());

  const pendingCount = useMemo(
    () => items.filter((item) => !isObligationDoneToday(item)).length,
    [items, todayKey],
  );

  const addItem = useCallback(() => {
    const text = draft.trim();
    if (!text) return;
    onItemsChange((prev) => [createObligation(text, draftDurationMin), ...prev]);
    setDraft("");
    setDraftDurationMin(undefined);
  }, [draft, draftDurationMin, onItemsChange]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        addItem();
      }
    },
    [addItem],
  );

  const confirmDone = useCallback(
    (id: string) => {
      onItemsChange((prev) =>
        prev.map((item) => (item.id === id ? { ...item, doneDayKey: todayKey } : item)),
      );
    },
    [onItemsChange, todayKey],
  );

  const undoDoneToday = useCallback(
    (id: string) => {
      onItemsChange((prev) =>
        prev.map((item) => {
          if (item.id !== id) return item;
          if (item.doneDayKey !== todayKey) return item;
          const { doneDayKey: _, ...rest } = item;
          return rest;
        }),
      );
    },
    [onItemsChange, todayKey],
  );

  const removeItem = useCallback(
    (id: string) => {
      onItemsChange((prev) => prev.filter((item) => item.id !== id));
    },
    [onItemsChange],
  );

  const setItemDuration = useCallback(
    (id: string, durationMin: number | undefined) => {
      onItemsChange((prev) =>
        prev.map((item) => {
          if (item.id !== id) return item;
          return {
            ...item,
            durationMin: durationMin && durationMin > 0 ? Math.round(durationMin) : undefined,
          };
        }),
      );
    },
    [onItemsChange],
  );

  return (
    <div className="tasks-panel obligations-panel">
      <header className="tasks-panel__hero">
        <div className="tasks-panel__hero-glow" aria-hidden />
        <div className="tasks-panel__hero-inner">
          <h1 className="tasks-panel__title">Обязаловка</h1>
          <p className="tasks-panel__subtitle">
            {items.length === 0
              ? "Ежедневные обязательства — добавьте первое"
              : pendingCount > 0
                ? `${pendingCount} ${obligationLabel(pendingCount)} на сегодня`
                : "На сегодня всё выполнено — завтра появятся снова"}
          </p>
        </div>
      </header>

      <div className="tasks-composer obligations-composer">
        <div className="tasks-composer__accent obligations-composer__accent" aria-hidden />
        <label className="tasks-composer__label" htmlFor={fieldId}>
          Новое обязательство
        </label>
        <textarea
          id={fieldId}
          className="tasks-composer__field"
          rows={3}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Что делать каждый день: зарядка, витамины, проверка почты…"
          spellCheck
        />
        <div className="tasks-composer__remind obligations-composer__duration">
          <span className="tasks-composer__remind-label" id={durationFieldId}>
            На выполнение
          </span>
          <DurationField
            allowEmpty
            value={draftDurationMin}
            aria-label="Время на выполнение нового обязательства"
            onChange={setDraftDurationMin}
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
          <button type="button" className="tasks-composer__submit" onClick={addItem} disabled={!draft.trim()}>
            <span className="tasks-composer__submit-icon" aria-hidden>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M9 3.5v11M3.5 9h11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </span>
            Добавить
          </button>
        </div>
      </div>

      <div className="tasks-panel__list-wrap">
        {items.length === 0 ? (
          <div className="tasks-empty" role="status">
            <div className="tasks-empty__orb tasks-empty__orb--a" aria-hidden />
            <div className="tasks-empty__orb tasks-empty__orb--b" aria-hidden />
            <p className="tasks-empty__text">Список пуст — запишите, что нужно делать каждый день</p>
          </div>
        ) : (
          <ul className="tasks-list obligations-list" aria-label="Ежедневные обязательства">
            {items.map((item) => {
              const doneToday = isObligationDoneToday(item);
              return (
                <li
                  key={item.id}
                  className={`tasks-list__item obligations-list__item${doneToday ? " tasks-list__item--done obligations-list__item--done-today" : ""}`}
                >
                  <div className="obligations-list__main">
                    <p className="tasks-list__text obligations-list__text">{item.text}</p>
                    <div className="obligations-list__duration">
                      <span className="obligations-list__duration-label">На выполнение</span>
                      <DurationField
                        allowEmpty
                        size="compact"
                        value={item.durationMin}
                        disabled={doneToday}
                        aria-label={`Время на выполнение: ${item.text}`}
                        onChange={(m) => setItemDuration(item.id, m)}
                      />
                    </div>
                  </div>
                  {doneToday ? (
                    <button
                      type="button"
                      className="obligations-list__undo"
                      onClick={() => undoDoneToday(item.id)}
                      aria-label={`Отменить выполнение сегодня: ${item.text}`}
                    >
                      Отменить
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="obligations-list__done"
                      onClick={() => confirmDone(item.id)}
                      aria-label={`Подтвердить выполнение: ${item.text}`}
                    >
                      Выполнено
                    </button>
                  )}
                  <button
                    type="button"
                    className="tasks-list__remove"
                    onClick={() => removeItem(item.id)}
                    aria-label={`Удалить из обязаловки: ${item.text}`}
                  >
                    <span aria-hidden>×</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function obligationLabel(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m100 >= 11 && m100 <= 14) return "обязательств";
  if (m10 === 1) return "обязательство";
  if (m10 >= 2 && m10 <= 4) return "обязательства";
  return "обязательств";
}
