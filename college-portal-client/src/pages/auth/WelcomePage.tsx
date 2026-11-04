import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import logo from '../../assets/logo.png';

/** Возможные расширения снимков, которые пользователь кладёт в public/screens. */
const SCREEN_EXTENSIONS = ['png', 'jpg', 'webp', 'gif'] as const;
/** Максимум снимков, которые пробуем подхватить (screen1..screenN). */
const MAX_SCREENS = 20;

/**
 * Автоматически собирает список снимков из /public/screens: перебирает
 * screen1, screen2, … с допустимыми расширениями и оставляет только те,
 * которые реально отдаются сервером. Добавили screen3.png — он появится
 * в галерее без изменения кода.
 */
function useScreens(): string[] {
  const [screens, setScreens] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    const check = async (i: number) => {
      for (const ext of SCREEN_EXTENSIONS) {
        const url = `${import.meta.env.BASE_URL}screens/screen${i}.${ext}`;
        try {
          // HEAD, чтобы только проверить существование файла.
          const res = await fetch(url, { method: 'HEAD' });
          if (res.ok) return url;
        } catch {
          // нет связи — просто пропускаем
        }
      }
      return null;
    };

    void (async () => {
      const results = await Promise.all(
        Array.from({ length: MAX_SCREENS }, (_, k) => check(k + 1)),
      );
      if (!cancelled) setScreens(results.filter((url): url is string => url !== null));
    })();

    return () => { cancelled = true; };
  }, []);

  return screens;
}

const features: Array<{ icon: string; title: string; text: string }> = [
  { icon: '📅', title: 'Расписание', text: 'Уроки на неделю, замены и неявки — с передачей из kkepik и электронного дневника.' },
  { icon: '📊', title: 'Оценки', text: 'Анимированный график успеваемости, цветной календарь оценок и средний балл — общий и по каждому предмету.' },
  { icon: '💬', title: 'Чаты', text: 'конкурент мессенджеру макс' },
  { icon: '🎨', title: 'Кружки', text: 'Трудно найти группу по интересам? Поробуй сделать кружок!' },
  { icon: '📰', title: 'Новости', text: 'Объявления колледжа и групп с картинками и удобным просмотром.' },
  { icon: '✅', title: 'Задания', text: 'Домашние работы и дедлайны со статусами «активно / просрочено».' },
  { icon: '🗺️', title: 'Карта колледжа', text: 'Интерактивная схема кабинетов: кликните по аудитории в расписании и увидите, куда идти.' },
  { icon: '👤', title: 'Профиль', text: 'Достижения, контакты, Telegram-привязка и публичная страница студента.' },
  { icon: '📱', title: 'PWA', text: 'Ставится как приложение на телефон и компьютер' },
];

/** Public landing page: описание портала, фичи и фотогалерея из /public/screens. */
export function WelcomePage() {
  const screens = useScreens();

  return (
    <div className="min-h-screen bg-dark-bg text-dark-text flex flex-col items-center px-4 py-10 sm:py-16">
      <div className="w-full max-w-3xl flex flex-col items-center text-center">
        <img src={logo} alt="KKEP.ka" className="w-40 h-40 sm:w-56 sm:h-56 object-contain" />

        <h1 className="text-3xl sm:text-5xl font-bold tracking-tight mt-2">
          KKEP<span className="text-primary-400">.</span>ka
        </h1>
        
        <p className="text-lg sm:text-xl text-dark-textMuted mt-3 max-w-xl">
          be in kkepka
        </p>
        <Link to="/login" className="mt-8 w-full sm:w-auto">
          <Button size="lg" className="w-full sm:w-auto px-10 text-base">
            Войти
          </Button>
        </Link>

        {/* Что это и как устроен проект */}
        <div className="mt-14 text-left w-full max-w-2xl space-y-4">
          <h2 className="text-xl sm:text-2xl font-bold">Что это и как устроено</h2>
          <p className="text-lg sm:text-xl text-dark-textMuted mt-3 max-w-xl">
          Портал колледжа: расписание, оценки, новости, задания и чаты — в одном месте.
        </p>
          <p className="text-dark-textMuted leading-relaxed">
            KKEP.ka — сайт-помощник для студентов колледжа. Предметы, оценки и неявки
            подтягиваются из электронного дневника и kkepik, а всё вокруг них —
            новости группы, задания, чаты, кружки и карта колледжа — живёт уже внутри портала.
          </p>
          <p className="text-dark-textMuted leading-relaxed">
            
            Разрабатывается группой студентов программистов, учавствовать в разработке, можно связавшись с админом
            Все данные хранятся в зашифрованном виде
            <a
              href="https://github.com/max-permyakov/Collegium"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:underline"
            >
              Исходный код на GitHub
            </a>
          </p>
        </div>

        {/* Все фичи */}
        <div className="mt-12 text-left w-full max-w-2xl">
          <h2 className="text-xl sm:text-2xl font-bold mb-4">Что внутри</h2>
          <ul className="divide-y divide-dark-border rounded-2xl border border-dark-border bg-dark-card">
            {features.map((feature) => (
              <li key={feature.title} className="flex items-start gap-3 px-4 py-3">
                <span className="text-xl mt-0.5 shrink-0" aria-hidden="true">{feature.icon}</span>
                <div>
                  <p className="font-medium text-dark-text">{feature.title}</p>
                  <p className="text-sm text-dark-textMuted">{feature.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Фотогалерея: снимки из public/screens/screen1.png, screen2.png… */}
        {screens.length > 0 && (
          <div className="mt-12 w-full">
            <h2 className="text-xl sm:text-2xl font-bold text-center mb-4">Как это выглядит</h2>
            <div className="grid gap-4 sm:grid-cols-1">
              {screens.map((url, index) => (
                <figure key={url} className="rounded-2xl border border-dark-border bg-dark-card p-2">
                  <img
                    src={url}
                    alt={`Снимок приложения ${index + 1}`}
                    className="rounded-xl w-full object-cover"
                    loading="lazy"
                  />
                </figure>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
