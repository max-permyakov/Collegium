/**
 * Шуточные статусы загрузки данных. Общий модуль для Suspense-фоллбека
 * (ленивые чанки роутов) и FunLoader'а (загрузка данных API/дневника).
 */

export const GENERAL = [
  'Боремся с РКН…',
  'Подключаем 17-й VPN…',
  'Взламываем эл. дневник… доигрались, он открылся сам',
  'Калибруем пингвина…',
  'Заставляем Tux работать… извините, только пикаем',
  'Договариваемся с kkepik…',
  'Смахиваем пыль с сервера…',
  'Ожидаем ответа 200 OK (мы верим)…',
];

export const GRADES = [
  'Несём ваши оценки…',
  'Средний балл уже близко…',
  'Пересчитываем двойки в десятичные…',
  'Уточняем у пингвина, что за «Н»…',
];

export const SCHEDULE = [
  'Читаем ваше расписание…',
  'Ищем замены по кабинетам…',
  'Гадаем, какая пара первая…',
];

export const HOME = [
  'Собираем твой день по кусочкам…',
  'Сверяем расписание с календарём…',
  'Подхватываем оценки с дневника…',
];

export const CHATS = [
  'Доставляем сообщения голубями… бип',
  'Синхронизируем чаты…',
  'Строим кружок по интересам…',
];

const BY_ROUTE: Array<{ test: (path: string) => boolean; phrases: string[] }> = [
  {
    test: (p) => p.startsWith('/grades') || p.startsWith('/performance'),
    phrases: GRADES,
  },
  {
    test: (p) => p.startsWith('/schedule'),
    phrases: SCHEDULE,
  },
  {
    test: (p) => p.startsWith('/chats') || p.startsWith('/clubs'),
    phrases: CHATS,
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

/** Фразы для текущего роута + общие (роутовые — первыми). */
export function poolFor(path: string): string[] {
  const own = BY_ROUTE.find(({ test }) => test(path))?.phrases ?? [];
  const rest = GENERAL.filter((p) => !own.includes(p));
  return [...own, ...rest];
}

/** Случайная фраза из пула, не совпадающая с предыдущей. */
export function pickRandom(list: string[], not: string | null): string {
  const candidates = list.length > 1 && not ? list.filter((p) => p !== not) : list;
  return candidates[Math.floor(Math.random() * candidates.length)];
}
