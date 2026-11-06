import { useEffect, useState } from 'react';
import type { Lesson } from '../../types';
import type { DayEntries } from '../../utils/gradeCalendar';
import { moscowNowTimeHMS } from '../../utils/datetime';

interface DayMoodProps {
  /** Все пары сегодня (не только оставшиеся). */
  todayAll?: Lesson[];
  /** Отметки за сегодня, чтобы порадовать/поддержать по оценкам. */
  marksToday?: DayEntries[];
}

interface Mood {
  emoji: string;
  text: string;
  anim: 'bob' | 'shake' | 'pulse';
}

const pluralPairs = (n: number) => {
  if (n === 1) return 'одна пара';
  if (n === 2) return 'две пары';
  if (n === 3) return 'три пары';
  if (n === 4) return 'четыре пары';
  return `${n} пар`;
};

const greetingFor = (now: string) => {
  const hour = Number(now.slice(0, 2));
  if (hour < 5) return 'Не спится?';
  if (hour < 11) return 'Доброе утро!';
  if (hour < 17) return 'Добрый день!';
  if (hour < 23) return 'Добрый вечер!';
  return 'Поздний вечер 🌙';
};

const moodFor = (total: number, allDone: boolean): Mood => {
  if (total === 0) return { emoji: '🐧', text: 'Пар сегодня нет — Tux официально одобряет отдых!', anim: 'bob' };
  if (allDone) return { emoji: '🎉', text: 'Пары на сегодня закончились — свободен!', anim: 'pulse' };
  switch (total) {
    case 1:
    case 2:
      return { emoji: '😄', text: `Всего ${pluralPairs(total)} — `, anim: 'pulse' };
    case 3:
      return { emoji: '🙂', text: 'Три пары — жить можно', anim: 'bob' };
    case 4:
      return { emoji: '💪', text: 'Четыре пары это уже Психологический хоррор. Кофе, рюкзак, молитва — и в перед!', anim: 'bob' };
    case 5:
      return { emoji: '😅', text: 'Пять пар… а такое бывает?', anim: 'shake' };
    default:
      return { emoji: '🤯', text: `${pluralPairs(total)}?! Это уже не день, это моральная эскалация`, anim: 'shake' };
  }
};

const marksNote = (entries?: DayEntries[]): string | null => {
  const values = entries?.flatMap((e) => e.markValues) ?? [];
  const fives = values.filter((v) => v === 'Five').length;
  const twos = values.filter((v) => v === 'Two').length;
  const fours = values.filter((v) => v === 'Four').length;
  if (fives > 0) return 'За сегодня уже есть 5 — пингвин гордо продвигает ваше дело';
  if (twos > 0) return 'Сегодня есть и 2 — не помешает прыгнуть выше на следующей паре';
  if (fours > 0) return 'Сегодня есть 4 — стабильно хорошо';
  return null;
};

/**
 * Полоска «настроения дня» на главной: приветствие по времени суток,
 * реакция на количество пар (радуемся / поддерживаем) и по отметкам дня.
 * Обновляет счётчик «прошло пар» каждую минуту без перезагрузки страницы.
 */
export function DayMood({ todayAll, marksToday }: DayMoodProps) {
  const [now, setNow] = useState(() => moscowNowTimeHMS());

  // Часы идут: каждые 60 секунд пересчитываем статус пар.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(moscowNowTimeHMS()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  if (!todayAll) return null; // старый кэш без массива пар — тихо скрываем

  const total = todayAll.length;
  const passed = total > 0 ? todayAll.filter((l) => (l.endTime ?? l.startTime) <= now).length : 0;
  const allDone = total > 0 && passed === total;
  const mood = moodFor(total, allDone);
  const note = marksNote(marksToday);
  const progress = total > 0 ? Math.round((passed / total) * 100) : 0;

  const animClass =
    mood.anim === 'bob' ? 'mood-emoji-bob' : mood.anim === 'shake' ? 'mood-emoji-shake' : 'animate-pulse';

  return (
    <div className="relative rounded-2xl overflow-hidden animate-fade-up" role="status">
      {/* Переливающаяся рамка */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(120deg,#38bdf8,#6366f1,#a855f7,#38bdf8)] bg-[length:300%_100%] [animation:shimmer-pan_8s_ease-in-out_infinite] opacity-60 motion-reduce:hidden"
      />
      <div className="relative m-px rounded-[calc(1rem-1px)] bg-dark-bg/85 px-4 py-3 flex items-center gap-3">
        <span className={`text-2xl shrink-0 ${animClass}`} aria-hidden="true">{mood.emoji}</span>
        <p className="min-w-0 flex-1 text-sm">
          <span className="text-dark-textMuted mr-1.5 hidden sm:inline">{greetingFor(now)}</span>
          <span className="text-dark-text">{mood.text}</span>
          {note && <span className="block text-xs text-dark-textMuted mt-0.5">{note}</span>}
        </p>
        {total > 0 && (
          <div className="shrink-0 hidden sm:flex flex-col items-end gap-1.5">
            <span className="text-xs text-dark-textMuted tabular-nums">
              прошло {passed} из {total}
            </span>
            <span className="block w-28 h-1.5 rounded-full bg-dark-border overflow-hidden">
              <span
                className="block h-full rounded-full bg-gradient-to-r from-primary-500 to-primary-300 transition-all duration-700"
                style={{ width: `${progress}%` }}
              />
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
