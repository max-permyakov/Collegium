import type { AuditoriumRefDto } from '../../types';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

interface MapSearchProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onClear: () => void;
  loading?: boolean;
  results: AuditoriumRefDto[] | null;
  error: string;
  onPick: (auditorium: AuditoriumRefDto) => void;
}

export function MapSearch({ value, onChange, onSubmit, onClear, loading, results, error, onPick }: MapSearchProps) {
  return (
    <div className="space-y-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="flex gap-2"
      >
        <Input
          label="Поиск аудитории"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Номер, дисциплина или преподаватель"
        />
        <div className="flex items-end gap-2 pb-0.5">
          <Button type="submit" loading={loading}>Найти</Button>
          {value && <Button type="button" variant="secondary" onClick={onClear}>Сброс</Button>}
        </div>
      </form>

      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>
      )}

      {results && (
        <div className="space-y-1.5">
          {results.length === 0 ? (
            <p className="text-sm text-dark-textMuted">Ничего не найдено</p>
          ) : (
            results.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => onPick(r)}
                className="w-full text-left rounded-xl border border-dark-border bg-dark-surface px-3 py-2 hover:border-primary-500/50 hover:bg-primary-500/10 transition-colors"
              >
                <span className="font-semibold text-primary-400">Ауд. {r.number}</span>
                {r.displayName && <span className="text-dark-text text-sm ml-2">{r.displayName}</span>}
                <span className="block text-xs text-dark-textMuted">{r.buildingName}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
