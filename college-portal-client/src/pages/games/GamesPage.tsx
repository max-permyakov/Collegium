import { Link } from 'react-router-dom';
import { Card } from '../../components/ui/Card';

const upcoming = [
  { icon: '🧩', title: 'Викторина' },
  { icon: '🎓', title: 'За оба стула' },
];

export function GamesPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-dark-text">Игры</h1>
        <p className="text-dark-textMuted">Мини-игры колледжа — отдых после пар</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link to="/games/escape" className="group">
          <Card variant="hover" className="h-full flex flex-col">
            <div className="text-4xl mb-3">🏃</div>
            <h2 className="text-lg font-semibold text-dark-text group-hover:text-primary-400 transition-colors">
              Побег от Физики / 1С
            </h2>
            <p className="text-sm text-dark-textMuted mt-1 flex-1">
              Беги и перепрыгивай формулы, формы и отчёты. Пригибайся под волнами
              и фразами из потока. Есть рейтинг беглецов.
            </p>
            <span className="mt-3 text-sm text-primary-400">Играть →</span>
          </Card>
        </Link>

        {upcoming.map((game) => (
          <Card key={game.title} className="h-full flex flex-col opacity-60">
            <div className="text-4xl mb-3">{game.icon}</div>
            <h2 className="text-lg font-semibold text-dark-text">{game.title}</h2>
            <p className="text-sm text-dark-textMuted mt-1 flex-1">Скоро</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
