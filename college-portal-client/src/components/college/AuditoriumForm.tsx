import { useMemo, useState, type FormEvent } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import type { AuditoriumDto, BuildingDto, CollegeTeacher, CreateAuditoriumDto, DisciplineDto } from '../../types';

export const getMapError = (err: unknown) => {
  const e = err as { response?: { data?: { message?: string } } };
  return e.response?.data?.message || 'Произошла ошибка';
};

export const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

// A new auditorium is placed near the map center with a small default rect.
export const defaultAuditoriumForm = (buildingId: string, mapWidth = 1024, mapHeight = 2048): CreateAuditoriumDto => {
  const width = 50;
  const height = 35;
  return {
    buildingId,
    number: '',
    displayName: '',
    floor: undefined,
    locationHint: '',
    hasComputers: false,
    x: clamp(Math.round(mapWidth / 2 - width / 2), 0, mapWidth - width),
    y: clamp(Math.round(mapHeight / 2 - height / 2), 0, mapHeight - height),
    width,
    height,
    disciplineIds: [],
    disciplineNames: [],
    teacherIds: [],
  };
};

// The schedule stores teachers as "Фамилия И.О." while CollegeTeacher.FullName
// is "Фамилия Имя Отчество" — match by surname and initials.
export const matchScheduleTeachers = (teachers: CollegeTeacher[], scheduleName: string): CollegeTeacher[] => {
  const tokens = scheduleName.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  const surname = tokens[0].toLowerCase();
  const initials = tokens.slice(1).map((t) => t.replace(/[^а-яёa-z]/gi, '').charAt(0).toLowerCase()).filter(Boolean);
  return teachers.filter((t) => {
    const parts = t.fullName.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0 || parts[0].toLowerCase() !== surname) return false;
    return initials.every((ini, i) => (parts[i + 1] ?? '').charAt(0).toLowerCase() === ini);
  });
};

export const formFromAuditorium = (a: AuditoriumDto): CreateAuditoriumDto => ({
  buildingId: a.buildingId,
  number: a.number,
  displayName: a.displayName ?? '',
  floor: a.floor ?? undefined,
  locationHint: a.locationHint ?? '',
  hasComputers: a.hasComputers,
  x: a.x,
  y: a.y,
  width: a.width,
  height: a.height,
  disciplineIds: [],
  disciplineNames: [],
  teacherIds: a.teachers.map((t) => t.id),
});

interface AuditoriumFormProps {
  form: CreateAuditoriumDto;
  onChange: (form: CreateAuditoriumDto) => void;
  buildings: BuildingDto[];
  disciplines?: DisciplineDto[];
  teachers?: CollegeTeacher[];
  onSubmit: () => void;
  onCancel: () => void;
  isPending?: boolean;
  error?: string | null;
  submitLabel?: string;
  hint?: string;
}

// Compact auditorium editor: primary fields only, everything optional is
// folded into "Дополнительные поля". Placement happens by clicking the map.
export function AuditoriumForm({
  form,
  onChange,
  buildings,
  disciplines,
  teachers,
  onSubmit,
  onCancel,
  isPending,
  error,
  submitLabel,
  hint,
}: AuditoriumFormProps) {
  const [disciplineInput, setDisciplineInput] = useState('');
  const [teacherFilter, setTeacherFilter] = useState('');

  const filteredTeachers = useMemo(() => {
    const list = teachers ?? [];
    const q = teacherFilter.trim().toLowerCase();
    if (!q) return list;
    return list.filter((t) => t.fullName.toLowerCase().includes(q));
  }, [teachers, teacherFilter]);

  const toggleDiscipline = (id: string) => {
    onChange({
      ...form,
      disciplineIds: form.disciplineIds.includes(id)
        ? form.disciplineIds.filter((x) => x !== id)
        : [...form.disciplineIds, id],
    });
  };

  const toggleTeacher = (id: string) => {
    onChange({
      ...form,
      teacherIds: form.teacherIds.includes(id)
        ? form.teacherIds.filter((x) => x !== id)
        : [...form.teacherIds, id],
    });
  };

  const addDisciplines = () => {
    const names = disciplineInput.split(',').map((n) => n.trim()).filter(Boolean);
    if (names.length === 0) return;
    onChange({ ...form, disciplineNames: [...new Set([...form.disciplineNames, ...names])] });
    setDisciplineInput('');
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit();
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-primary-500/30 bg-dark-surface p-4 space-y-3">
      <p className="text-xs text-dark-textMuted">{hint ?? 'Кликните по карте, чтобы переместить аудиторию.'}</p>

      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-dark-text mb-1.5">Корпус</label>
          <select
            className="input"
            value={form.buildingId}
            onChange={(e) => onChange({ ...form, buildingId: e.target.value })}
            required
          >
            <option value="">Выберите корпус</option>
            {buildings.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
        <Input
          label="Номер"
          value={form.number}
          onChange={(e) => onChange({ ...form, number: e.target.value })}
          required
        />
        <Input
          label="Этаж"
          type="number"
          value={form.floor ?? ''}
          onChange={(e) => onChange({ ...form, floor: e.target.value === '' ? undefined : Number(e.target.value) })}
        />
        <div className="grid grid-cols-2 gap-2">
          <Input
            label="Ширина"
            type="number"
            min={20}
            value={Math.round(form.width)}
            onChange={(e) => onChange({ ...form, width: Number(e.target.value) })}
          />
          <Input
            label="Высота"
            type="number"
            min={20}
            value={Math.round(form.height)}
            onChange={(e) => onChange({ ...form, height: Number(e.target.value) })}
          />
        </div>
      </div>

      <details className="rounded-xl border border-dark-border bg-dark-surface/50 px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium text-dark-textMuted select-none">
          Дополнительные поля
        </summary>
        <div className="grid gap-3 sm:grid-cols-2 mt-3">
          <Input
            label="Название"
            value={form.displayName ?? ''}
            onChange={(e) => onChange({ ...form, displayName: e.target.value })}
          />
          <Input
            label="Ориентир"
            value={form.locationHint ?? ''}
            onChange={(e) => onChange({ ...form, locationHint: e.target.value })}
            placeholder="Например, у столовой"
          />
          <label className="flex items-center gap-2 text-sm text-dark-text">
            <input
              type="checkbox"
              checked={form.hasComputers}
              onChange={(e) => onChange({ ...form, hasComputers: e.target.checked })}
            />
            С компьютерами
          </label>
          <div className="grid grid-cols-2 gap-2">
            <Input
              label="X"
              type="number"
              value={Math.round(form.x)}
              onChange={(e) => onChange({ ...form, x: Number(e.target.value) })}
            />
            <Input
              label="Y"
              type="number"
              value={Math.round(form.y)}
              onChange={(e) => onChange({ ...form, y: Number(e.target.value) })}
            />
          </div>
        </div>
      </details>

      {/* Disciplines */}
      <div>
        <p className="text-sm font-medium text-dark-text mb-1.5">Дисциплины</p>
        {(disciplines?.length ?? 0) + form.disciplineNames.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2 max-h-24 overflow-y-auto">
            {(disciplines ?? []).map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => toggleDiscipline(d.id)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${form.disciplineIds.includes(d.id) ? 'bg-primary-500/20 text-primary-400 border-primary-500/30' : 'bg-dark-border text-dark-textMuted border-transparent'}`}
              >
                {d.name}
              </button>
            ))}
            {form.disciplineNames.map((n) => (
              <span
                key={n}
                className="px-2.5 py-1 rounded-full text-xs font-medium bg-green-500/20 text-green-400 border border-green-500/30 flex items-center gap-1.5"
              >
                {n}
                <button
                  type="button"
                  className="hover:text-dark-text"
                  onClick={() => onChange({ ...form, disciplineNames: form.disciplineNames.filter((x) => x !== n) })}
                  aria-label={`Убрать ${n}`}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Input
            value={disciplineInput}
            onChange={(e) => setDisciplineInput(e.target.value)}
            placeholder="Дисциплина (через запятую)"
          />
          <Button type="button" variant="secondary" onClick={addDisciplines}>+</Button>
        </div>
      </div>

      {/* Teachers */}
      <div>
        <div className="flex items-center justify-between mb-1.5 gap-2">
          <p className="text-sm font-medium text-dark-text">Преподаватели</p>
          <input
            className="rounded-lg bg-dark-surface border border-dark-border px-2 py-1 text-xs text-dark-text w-32"
            placeholder="Фильтр..."
            value={teacherFilter}
            onChange={(e) => setTeacherFilter(e.target.value)}
          />
        </div>
        <div className="max-h-32 overflow-auto rounded-xl border border-dark-border divide-y divide-dark-border">
          {(teachers ?? []).length === 0 ? (
            <p className="p-3 text-xs text-dark-textMuted">Преподаватели не найдены</p>
          ) : filteredTeachers.length === 0 ? (
            <p className="p-3 text-xs text-dark-textMuted">Ничего не найдено</p>
          ) : (
            filteredTeachers.map((t) => (
              <label key={t.id} className="flex items-center gap-2 px-3 py-2 text-sm text-dark-text cursor-pointer hover:bg-dark-border/40">
                <input
                  type="checkbox"
                  checked={form.teacherIds.includes(t.id)}
                  onChange={() => toggleTeacher(t.id)}
                />
                <span className="truncate">{t.fullName}</span>
              </label>
            ))
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <Button type="submit" loading={isPending} disabled={!form.buildingId || !form.number.trim()}>
          {submitLabel ?? 'Сохранить'}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Отмена
        </Button>
      </div>
    </form>
  );
}
