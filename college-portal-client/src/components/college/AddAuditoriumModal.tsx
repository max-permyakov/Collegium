import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { collegeMapApi, collegeInfoApi } from '../../services/api';
import { CollegeMap } from './CollegeMap';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import type { AuditoriumDto, CollegeMapDto, CollegeTeacher, CreateAuditoriumDto } from '../../types';

const getError = (err: unknown) => {
  const e = err as { response?: { data?: { message?: string } } };
  return e.response?.data?.message || 'Не удалось добавить аудиторию';
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const emptyForm = (number: string, disciplineName?: string): CreateAuditoriumDto => ({
  buildingId: '',
  number,
  displayName: '',
  floor: undefined,
  locationHint: '',
  hasComputers: false,
  x: 100,
  y: 100,
  width: 160,
  height: 100,
  disciplineIds: [],
  disciplineNames: disciplineName ? [disciplineName] : [],
  teacherIds: [],
});

// The schedule stores teachers as "Фамилия И.О." while CollegeTeacher.FullName
// is "Фамилия Имя Отчество" — match by surname and initials.
const matchTeachers = (teachers: CollegeTeacher[], scheduleName: string): CollegeTeacher[] => {
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

interface AddAuditoriumModalProps {
  number: string;
  disciplineName?: string;
  teacherName?: string;
  onClose: () => void;
  onCreated: (auditorium: AuditoriumDto) => void;
}

export function AddAuditoriumModal({ number, disciplineName, teacherName, onClose, onCreated }: AddAuditoriumModalProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CreateAuditoriumDto>(emptyForm(number, disciplineName));
  const [disciplineInput, setDisciplineInput] = useState('');
  const [teacherFilter, setTeacherFilter] = useState('');
  const [error, setError] = useState('');

  const { data: map } = useQuery<CollegeMapDto>({
    queryKey: ['college-map'],
    queryFn: async () => (await collegeMapApi.getMap()).data,
  });
  const { data: teachers } = useQuery({
    queryKey: ['college-teachers'],
    queryFn: async () => (await collegeInfoApi.getTeachers()).data,
  });

  // Prefill building and center the preview rect once the map dimensions are known.
  useEffect(() => {
    if (!map) return;
    setForm((f) => {
      if (f.buildingId && f.x !== 100 && f.y !== 100) return f;
      const buildingId = f.buildingId || map.buildings[0]?.id || '';
      return {
        ...f,
        buildingId,
        x: Math.round(map.mapWidth / 2 - f.width / 2),
        y: Math.round(map.mapHeight / 2 - f.height / 2),
      };
    });
  }, [map]);

  const matchedTeachers = useMemo(
    () => (teachers && teacherName ? matchTeachers(teachers, teacherName) : []),
    [teachers, teacherName]
  );

  // Preselect the first exact match so the admin only has to confirm.
  useEffect(() => {
    if (matchedTeachers.length === 0) return;
    setForm((f) => (f.teacherIds.length > 0 ? f : { ...f, teacherIds: [matchedTeachers[0].id] }));
  }, [matchedTeachers]);

  const filteredTeachers = useMemo(() => {
    const list = teachers ?? [];
    const q = teacherFilter.trim().toLowerCase();
    if (!q) return list;
    return list.filter((t) => t.fullName.toLowerCase().includes(q));
  }, [teachers, teacherFilter]);

  const mutation = useMutation({
    mutationFn: async () => collegeMapApi.createAuditorium(form),
    onSuccess: async (res) => {
      await queryClient.invalidateQueries({ queryKey: ['college-map'] });
      await queryClient.invalidateQueries({ queryKey: ['college-map-disciplines'] });
      onCreated(res.data);
    },
    onError: (e) => setError(getError(e)),
  });

  const mapWidth = map?.mapWidth ?? 1024;
  const mapHeight = map?.mapHeight ?? 2048;

  const handleMapClick = (clickX: number, clickY: number) => {
    setForm((f) => ({
      ...f,
      x: Math.round(clamp(clickX - f.width / 2, 0, mapWidth - f.width)),
      y: Math.round(clamp(clickY - f.height / 2, 0, mapHeight - f.height)),
    }));
  };

  const handlePreviewDrag = (x: number, y: number) => {
    setForm((f) => ({ ...f, x, y }));
  };

  const toggleTeacher = (id: string) => {
    setForm((f) => ({
      ...f,
      teacherIds: f.teacherIds.includes(id)
        ? f.teacherIds.filter((x) => x !== id)
        : [...f.teacherIds, id],
    }));
  };

  const addDisciplines = () => {
    const names = disciplineInput.split(',').map((n) => n.trim()).filter(Boolean);
    if (names.length === 0) return;
    setForm((f) => ({ ...f, disciplineNames: [...new Set([...f.disciplineNames, ...names])] }));
    setDisciplineInput('');
  };

  return (
    <Modal title="Добавить аудиторию на карту" onClose={onClose} wide>
      <div className="space-y-4">
        <p className="text-sm text-dark-textMuted">
          Аудитория <span className="font-semibold text-dark-text">{'Ауд. '}{number}</span> не найдена на карте.
          Заполните данные и укажите её расположение.
        </p>

        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-dark-text mb-1.5">Корпус</label>
            <select
              className="input"
              value={form.buildingId}
              onChange={(e) => setForm({ ...form, buildingId: e.target.value })}
              required
            >
              <option value="">Выберите корпус</option>
              {(map?.buildings ?? []).map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <Input
            label="Номер"
            value={form.number}
            onChange={(e) => setForm({ ...form, number: e.target.value })}
            required
          />
          <Input
            label="Этаж"
            type="number"
            value={form.floor ?? ''}
            onChange={(e) => setForm({ ...form, floor: e.target.value === '' ? undefined : Number(e.target.value) })}
          />
          <Input
            label="Ориентир"
            value={form.locationHint ?? ''}
            onChange={(e) => setForm({ ...form, locationHint: e.target.value })}
            placeholder="Например, у столовой"
          />
        </div>

        {/* Disciplines prefilled from the schedule lesson */}
        <div>
          <p className="text-sm font-medium text-dark-text mb-1.5">Дисциплины</p>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {form.disciplineNames.map((n) => (
              <span
                key={n}
                className="px-2.5 py-1 rounded-full text-xs font-medium bg-green-500/20 text-green-400 border border-green-500/30 flex items-center gap-1.5"
              >
                {n}
                <button
                  type="button"
                  className="hover:text-dark-text"
                  onClick={() => setForm((f) => ({ ...f, disciplineNames: f.disciplineNames.filter((x) => x !== n) }))}
                  aria-label={`Убрать ${n}`}
                >
                  ✕
                </button>
              </span>
            ))}
            {form.disciplineNames.length === 0 && (
              <span className="text-xs text-dark-textMuted">Дисциплины не выбраны</span>
            )}
          </div>
          <div className="flex gap-2">
            <Input
              value={disciplineInput}
              onChange={(e) => setDisciplineInput(e.target.value)}
              placeholder="Добавить дисциплину (через запятую)"
            />
            <Button type="button" variant="secondary" onClick={addDisciplines}>Добавить</Button>
          </div>
        </div>

        {/* Teachers: schedule name matched against the college teachers database */}
        <div>
          <div className="flex items-center justify-between mb-1.5 gap-2">
            <p className="text-sm font-medium text-dark-text">Преподаватели</p>
            <input
              className="rounded-lg bg-dark-surface border border-dark-border px-2 py-1 text-xs text-dark-text"
              placeholder="Фильтр..."
              value={teacherFilter}
              onChange={(e) => setTeacherFilter(e.target.value)}
            />
          </div>
          {teacherName && matchedTeachers.length === 0 && (
            <p className="text-xs text-amber-400 mb-1.5">
              Преподаватель «{teacherName}» не найден в базе — связь не будет установлена автоматически.
            </p>
          )}
          <div className="max-h-40 overflow-auto rounded-xl border border-dark-border divide-y divide-dark-border">
            {filteredTeachers.length === 0 ? (
              <p className="p-3 text-xs text-dark-textMuted">Преподаватели не найдены</p>
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

        <div>
          <p className="text-sm font-medium text-dark-text mb-1.5">Расположение на карте</p>
          <p className="text-xs text-dark-textMuted mb-2">
            Кликните по карте, чтобы поставить аудиторию, или перетащите прямоугольник.
          </p>
          {map ? (
            <CollegeMap
              map={map}
              previewRect={{ x: form.x, y: form.y, width: form.width, height: form.height, label: form.number || '?' }}
              onMapClick={handleMapClick}
              onPreviewDrag={handlePreviewDrag}
              onSelect={() => undefined}
            />
          ) : (
            <div className="skeleton h-64" />
          )}
        </div>

        <div className="flex gap-2">
          <Button
            type="button"
            loading={mutation.isPending}
            disabled={!form.buildingId || !form.number.trim()}
            onClick={() => mutation.mutate()}
          >
            Добавить на карту
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            Отмена
          </Button>
        </div>
      </div>
    </Modal>
  );
}
