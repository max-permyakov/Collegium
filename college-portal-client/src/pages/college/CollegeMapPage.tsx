import { Card, CardContent } from '../../components/ui/Card';

const MapIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
  </svg>
);

export function CollegeMapPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-dark-text">Карта колледжа</h1>
        <p className="text-dark-textMuted">Схема корпусов и аудиторий</p>
      </div>
      <Card variant="hover" className="text-center py-16">
        <CardContent className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-primary-500/10 flex items-center justify-center">
            <MapIcon className="w-8 h-8 text-primary-400" />
          </div>
          <div>
            <p className="text-lg font-semibold text-dark-text mb-1">Раздел находится в разработке</p>
            <p className="text-dark-textMuted text-sm">
              Здесь появится интерактивная схема корпусов, кабинетов и лабораторий.
              А пока вы можете искать аудитории в разделе «Расписание».
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}