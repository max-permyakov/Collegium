import { useEffect, useState } from 'react';

/**
 * Забавные статусы загрузки: фразу, зависящую от текущего адреса,
 * крутим каждые ~1.2 секунды, пока грузится страница.
 */
const GENERAL = [
  'Боремся с РКН…',
  'Подключаем 17-й VPN…',
  'Взламываем эл. дневник… доигрались, он открылся сам',
  'Калибруем пингвина…',
  'Заставляем Tux работать… извините, только пикаем',
  'Договариваемся с kkepik…',
  'Смахиваем пыль с сервера…',
  'Ожидаем ответа 200 OK (мы верим)…',
];

const BY_ROUTE: Array<{ test: (path: string) => boolean; phrases: string[] }> = [
  {
    test: (p) => p.startsWith('/grades') || p.startsWith('/performance'),
    phrases: [
      'Несём ваши оценки…',
      'Средний балл уже близко…',
      'Пересчитываем двойки в десятичные…',
      'Уточняем у пингвина, что за «Н»…',
    ],
  },
  {
    test: (p) => p.startsWith('/schedule'),
    phrases: ['Читаем ваше расписание…', 'Ищем замены по кабинетам…', 'Гадаем, какая пара первая…'],
  },
  {
    test: (p) => p.startsWith('/chats') || p.startsWith('/clubs'),
    phrases: ['Доставляем сообщения голубями… бип', 'Синхронизируем чаты…', 'Строим кружок по интересам…'],
  },
  {
    test: (p) => p.startsWith('/assignments'),
    phrases: ['Считаем дедлайны на пальцах…', 'Спрашиваем, кто не сдал…'],
  },
  {
    test: (p) => p.startsWith('/news'),
    phrases: ['Распечатываем объявления…', 'Свежие новости, прям с принтера…'],
  },
  {
    test: (p) => p.startsWith('/games'),
    phrases: ['Заряжаем бегуна от Физики…', 'Спавним формы и отчёты…', 'Ищем, где спрятана 1С…'],
  },
  {
    test: (p) => p.startsWith('/profile') || p.startsWith('/users'),
    phrases: ['Открываем личное дело…', 'Полируем аватарку…'],
  },
  {
    test: (p) => p.startsWith('/admin'),
    phrases: ['Берём бразды правления…', 'Входим в режим админа: sudo всё…'],
  },
  {
    test: (p) => p.startsWith('/complete-profile'),
    phrases: ['Оформляем пропуск…', 'Заносим вас в базу студентов…'],
  },
  {
    test: (p) => p.startsWith('/college-info'),
    phrases: ['Разворачиваем карту колледжа…', 'Ищем нужный кабинет по коридорам…'],
  },
];

/** Фразы для текущего роута + общие, вперемешку (роутовые — первыми). */
function poolFor(path: string): string[] {
  const own = (BY_ROUTE.find(({ test }) => test(path))?.phrases ?? []);
  const rest = GENERAL.filter((p) => !own.includes(p));
  return [...own, ...rest];
}

const pickRandom = (list: string[], not: string | null): string => {
  const candidates = list.length > 1 && not ? list.filter((p) => p !== not) : list;
  return candidates[Math.floor(Math.random() * candidates.length)];
};

/**
 * Suspense fallback для ленивых роутов: спиннер + вращающиеся шуточные
 * статусы («Боремся с РКН», «Несём ваши оценки» — по текущему адресу).
 */
export function PageFallback() {
  const [phrase, setPhrase] = useState<string | null>(null);

  useEffect(() => {
    const pool = poolFor(window.location.pathname);
    setPhrase((current) => current ?? pickRandom(pool, null));
    const timer = window.setInterval(() => setPhrase((p) => pickRandom(poolFor(window.location.pathname), p)), 1200);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4" role="status" aria-live="polite">
      <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary-500 border-t-transparent" />
      <div className="flex items-center gap-1.5 min-h-6">
        {phrase === null ? (
          <span className="sr-only">Загрузка страницы</span>
        ) : (
          <span className="text-sm text-dark-textMuted tabular-nums">
            <span className="text-primary-400 font-mono text-xs mr-1.5">&gt;_</span>
            {phrase}
            {/* Три «печатающиеся» точки */}
            <span className="inline-flex gap-0.5 ml-1 align-middle" aria-hidden="true">
              <span className="w-1 h-1 rounded-full bg-primary-400 animate-bounce" />
              <span className="w-1 h-1 rounded-full bg-primary-400 animate-bounce [animation-delay:120ms]" />
              <span className="w-1 h-1 rounded-full bg-primary-400 animate-bounce [animation-delay:240ms]" />
            </span>
          </span>
        )}
      </div>
    </div>
  );
}
