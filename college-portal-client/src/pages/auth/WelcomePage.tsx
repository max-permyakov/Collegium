import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import logo from '../../assets/logo.png';

const features: Array<{ icon: string; title: string; text: string }> = [
  { icon: '📅', title: 'Расписание', text: 'Актуальные уроки, замены и каникулы — всегда под рукой.' },
  { icon: '📊', title: 'Оценки', text: 'График успеваемости, средний балл и календарь оценок по предметам.' },
  { icon: '💬', title: 'Чаты и кружки', text: 'Личные переписки, кружки и групповые обсуждения в одном месте.' },
  { icon: '🔔', title: 'Уведомления', text: 'Push-уведомления о новостях, заданиях и новых оценках.' },
];

/** Public landing page: короткое описание портала и кнопка входа. */
export function WelcomePage() {
  return (
    <div className="min-h-screen bg-dark-bg text-dark-text flex flex-col items-center px-4 py-10 sm:py-16">
      <div className="w-full max-w-3xl flex flex-col items-center text-center">
        <img src={logo} alt="KKEP.ka" className="w-40 h-40 sm:w-56 sm:h-56 object-contain" />

        <h1 className="text-3xl sm:text-5xl font-bold tracking-tight mt-2">
          KKEP<span className="text-primary-400">.</span>ka
        </h1>
        <p className="text-lg sm:text-xl text-dark-textMuted mt-3 max-w-xl">
          Портал колледжа: расписание, оценки, новости, задания и чаты — в одном месте.
        </p>

        <Link to="/login" className="mt-8 w-full sm:w-auto">
          <Button size="lg" className="w-full sm:w-auto px-10 text-base">
            Войти
          </Button>
        </Link>
        <p className="text-sm text-dark-textMuted mt-3 max-w-md">
          Войдите по почте или с помощью электронного дневника. Привязать дневник можно в любой момент.
        </p>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 w-full text-left">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="rounded-2xl border border-dark-border bg-dark-card p-5 hover:border-primary-500/40 transition-colors"
            >
              <span className="text-2xl" aria-hidden="true">{feature.icon}</span>
              <h2 className="font-semibold mt-2">{feature.title}</h2>
              <p className="text-sm text-dark-textMuted mt-1">{feature.text}</p>
            </div>
          ))}
        </div>

        <p className="text-xs text-dark-textMuted mt-12 text-center">
          Данные дневника хранятся в зашифрованном виде.{' '}
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
    </div>
  );
}
