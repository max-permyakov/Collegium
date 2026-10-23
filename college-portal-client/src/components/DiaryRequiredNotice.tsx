import { Link } from 'react-router-dom';
import { Card, CardContent } from './ui/Card';
import { Button } from './ui/Button';

export function DiaryRequiredNotice() {
  return (
    <Card variant="hover" className="text-center py-12">
      <CardContent className="space-y-4">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-primary-500/20 flex items-center justify-center">
          <svg className="w-8 h-8 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <div>
          <h2 className="text-lg font-semibold text-dark-text mb-1">Нужен дневник</h2>
          <p className="text-dark-textMuted max-w-md mx-auto">
            Оценки и рейтинг доступны после привязки электронного дневника к аккаунту.
          </p>
        </div>
        <Link to="/profile">
          <Button variant="primary">Привязать дневник</Button>
        </Link>
      </CardContent>
    </Card>
  );
}
