import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { collegeMapApi, collegeInfoApi } from '../../services/api';
import { CollegeMap } from '../../components/college/CollegeMap';
import {
  AuditoriumForm,
  clamp,
  defaultAuditoriumForm,
  formFromAuditorium,
  getMapError,
} from '../../components/college/AuditoriumForm';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input, Textarea } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { notifySuccess } from '../../utils/notify';
import type { AuditoriumDto, BuildingDto, CollegeMapDto, CreateAuditoriumDto, CreateBuildingDto } from '../../types';

const emptyBuildingForm = (): CreateBuildingDto => ({ name: '', description: '', sortOrder: 0 });

export function MapTab() {
  const queryClient = useQueryClient();
  const [error, setError] = useState('');

  const { data: map, isLoading } = useQuery<CollegeMapDto>({
    queryKey: ['college-map'],
    queryFn: async () => (await collegeMapApi.getMap()).data,
  });
  const { data: teachers } = useQuery({
    queryKey: ['college-teachers'],
    queryFn: async () => (await collegeInfoApi.getTeachers()).data,
  });
  const { data: disciplines } = useQuery({
    queryKey: ['college-map-disciplines'],
    queryFn: async () => (await collegeMapApi.getDisciplines()).data,
  });

  const mapWidth = map?.mapWidth ?? 1024;
  const mapHeight = map?.mapHeight ?? 2048;

  const [filterBuildingId, setFilterBuildingId] = useState<string | null>(null);
  const [floorFilter, setFloorFilter] = useState<number | 'none' | null>(null);
  const [showBuildingForm, setShowBuildingForm] = useState(false);
  const [editingBuilding, setEditingBuilding] = useState<BuildingDto | null>(null);
  const [buildingForm, setBuildingForm] = useState<CreateBuildingDto>(emptyBuildingForm());

  const [showAudForm, setShowAudForm] = useState(false);
  const [editingAud, setEditingAud] = useState<AuditoriumDto | null>(null);
  const [audForm, setAudForm] = useState<CreateAuditoriumDto>(defaultAuditoriumForm(''));

  const buildingFormRef = useRef<HTMLFormElement>(null);
  const audFormRef = useRef<HTMLDivElement>(null);

  const scrollIntoView = (el: HTMLElement | null) => {
    requestAnimationFrame(() => el?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['college-map'] });
    queryClient.invalidateQueries({ queryKey: ['college-map-disciplines'] });
  };

  const buildingsMutation = useMutation({
    mutationFn: async () => {
      if (editingBuilding) {
        await collegeMapApi.updateBuilding(editingBuilding.id, buildingForm);
      } else {
        await collegeMapApi.createBuilding(buildingForm);
      }
    },
    onSuccess: () => {
      notifySuccess(editingBuilding ? 'Корпус обновлён' : 'Корпус добавлен');
      setShowBuildingForm(false);
      setEditingBuilding(null);
      setBuildingForm(emptyBuildingForm());
      invalidate();
    },
    onError: (e) => setError(getMapError(e)),
  });

  const deleteBuildingMutation = useMutation({
    mutationFn: (id: string) => collegeMapApi.deleteBuilding(id),
    onSuccess: () => {
      notifySuccess('Корпус удалён');
      invalidate();
    },
    onError: (e) => setError(getMapError(e)),
  });

  const audMutation = useMutation({
    mutationFn: async () => {
      if (editingAud) {
        await collegeMapApi.updateAuditorium(editingAud.id, audForm);
      } else {
        await collegeMapApi.createAuditorium(audForm);
      }
    },
    onSuccess: () => {
      notifySuccess(editingAud ? 'Аудитория обновлена' : 'Аудитория добавлена');
      setShowAudForm(false);
      setEditingAud(null);
      setAudForm(defaultAuditoriumForm(filterBuildingId ?? map?.buildings[0]?.id ?? '', mapWidth, mapHeight));
      invalidate();
    },
    onError: (e) => setError(getMapError(e)),
  });

  const deleteAudMutation = useMutation({
    mutationFn: (id: string) => collegeMapApi.deleteAuditorium(id),
    onSuccess: () => {
      notifySuccess('Аудитория удалена');
      invalidate();
    },
    onError: (e) => setError(getMapError(e)),
  });

  const auditoriums = useMemo(() => {
    let list = map?.auditoriums ?? [];
    if (filterBuildingId) list = list.filter((a) => a.buildingId === filterBuildingId);
    if (floorFilter != null) {
      list = list.filter((a) => (floorFilter === 'none' ? a.floor == null : a.floor === floorFilter));
    }
    return list;
  }, [map, filterBuildingId, floorFilter]);

  const floors = useMemo(() => {
    const set = new Set<number>();
    let hasNone = false;
    (map?.auditoriums ?? []).forEach((a) => {
      if (filterBuildingId && a.buildingId !== filterBuildingId) return;
      if (a.floor == null) hasNone = true;
      else set.add(a.floor);
    });
    return { values: [...set].sort((x, y) => x - y), hasNone };
  }, [map, filterBuildingId]);

  const isAudFormOpen = showAudForm || editingAud !== null;

  const previewRect = isAudFormOpen
    ? { x: audForm.x, y: audForm.y, width: audForm.width, height: audForm.height, label: audForm.number || '?' }
    : null;

  const handleMapClick = (clickX: number, clickY: number) => {
    if (!isAudFormOpen) return;
    setAudForm((f) => ({
      ...f,
      x: Math.round(clamp(clickX - f.width / 2, 0, mapWidth - f.width)),
      y: Math.round(clamp(clickY - f.height / 2, 0, mapHeight - f.height)),
    }));
  };

  const handlePreviewDrag = (x: number, y: number) => {
    setAudForm((f) => ({ ...f, x, y }));
  };

  const handleMapSelect = (a: AuditoriumDto) => {
    if (isAudFormOpen) return;
    openEditAud(a);
  };

  const openCreateBuilding = () => {
    setEditingAud(null);
    setShowAudForm(false);
    setEditingBuilding(null);
    setBuildingForm(emptyBuildingForm());
    setShowBuildingForm(true);
    scrollIntoView(buildingFormRef.current);
  };

  const openEditBuilding = (b: BuildingDto) => {
    setEditingAud(null);
    setShowAudForm(false);
    setEditingBuilding(b);
    setBuildingForm({ name: b.name, description: b.description ?? '', sortOrder: b.sortOrder });
    setShowBuildingForm(true);
    scrollIntoView(buildingFormRef.current);
  };

  const openCreateAud = () => {
    const defaultBuilding = filterBuildingId ?? map?.buildings[0]?.id ?? '';
    setEditingBuilding(null);
    setShowBuildingForm(false);
    setEditingAud(null);
    setAudForm(defaultAuditoriumForm(defaultBuilding, mapWidth, mapHeight));
    setFilterBuildingId(defaultBuilding || null);
    setError('');
    setShowAudForm(true);
    scrollIntoView(audFormRef.current);
  };

  const openEditAud = (a: AuditoriumDto) => {
    const ids = a.disciplines
      .map((name) => disciplines?.find((d) => d.name === name)?.id)
      .filter((id): id is string => Boolean(id));
    setEditingAud(a);
    setAudForm({ ...formFromAuditorium(a), disciplineIds: ids });
    setFilterBuildingId(a.buildingId);
    setError('');
    setEditingBuilding(null);
    setShowBuildingForm(false);
    setShowAudForm(true);
    scrollIntoView(audFormRef.current);
  };

  const closeAudForm = () => {
    setShowAudForm(false);
    setEditingAud(null);
    setError('');
  };

  if (isLoading) return <div className="skeleton h-64" />;

  return (
    <div className="space-y-6">
      {error && !isAudFormOpen && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center justify-between">
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={() => setError('')}>✕</Button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(400px,560px)]">
        {/* Left: map. While the auditorium form is open on small screens the
            map sticks to the top so the map and the form stay visible. */}
        <div
          className={
            isAudFormOpen
              ? 'sticky top-0 z-20 max-h-[45vh] overflow-y-auto rounded-2xl bg-dark-bg lg:sticky lg:top-4 lg:self-start lg:max-h-none lg:overflow-visible lg:bg-transparent lg:z-auto'
              : 'lg:sticky lg:top-4 lg:self-start'
          }
        >
      {map && (
        <Card variant="hover">
          <CardHeader className="flex items-center justify-between flex-row gap-2">
            <CardTitle>Карта</CardTitle>
            <span className="text-xs text-dark-textMuted">
              {isAudFormOpen ? 'Кликните по карте или перетащите прямоугольник' : 'Кликните по аудитории, чтобы изменить'}
            </span>
          </CardHeader>
          <CardContent className="space-y-3">
            {!isAudFormOpen && (
              <>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => { setFilterBuildingId(null); setFloorFilter(null); }}
                    className={`px-3 py-1.5 rounded-lg text-sm ${filterBuildingId === null ? 'bg-primary-500/20 text-primary-400' : 'text-dark-textMuted hover:text-dark-text'}`}
                  >
                    Все корпуса
                  </button>
                  {map.buildings.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => { setFilterBuildingId(b.id); setFloorFilter(null); }}
                      className={`px-3 py-1.5 rounded-lg text-sm ${filterBuildingId === b.id ? 'bg-primary-500/20 text-primary-400' : 'text-dark-textMuted hover:text-dark-text'}`}
                    >
                      {b.name}
                    </button>
                  ))}
                </div>

                {(floors.values.length > 0 || floors.hasNone) && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-dark-textMuted uppercase tracking-wide">Этаж:</span>
                    <button
                      onClick={() => setFloorFilter(null)}
                      className={`px-3 py-1.5 rounded-lg text-sm ${floorFilter === null ? 'bg-primary-500/20 text-primary-400' : 'text-dark-textMuted hover:text-dark-text'}`}
                    >
                      Все
                    </button>
                    {floors.values.map((f) => (
                      <button
                        key={f}
                        onClick={() => setFloorFilter(f)}
                        className={`px-3 py-1.5 rounded-lg text-sm ${floorFilter === f ? 'bg-primary-500/20 text-primary-400' : 'text-dark-textMuted hover:text-dark-text'}`}
                      >
                        {f}
                      </button>
                    ))}
                    {floors.hasNone && (
                      <button
                        onClick={() => setFloorFilter('none')}
                        className={`px-3 py-1.5 rounded-lg text-sm ${floorFilter === 'none' ? 'bg-primary-500/20 text-primary-400' : 'text-dark-textMuted hover:text-dark-text'}`}
                      >
                        Без этажа
                      </button>
                    )}
                  </div>
                )}
              </>
            )}

            <CollegeMap
              map={map}
              selectedId={editingAud?.id ?? null}
              activeBuildingId={isAudFormOpen ? null : filterBuildingId}
              activeFloor={isAudFormOpen ? null : floorFilter}
              onSelect={handleMapSelect}
              previewRect={previewRect}
              onMapClick={isAudFormOpen ? handleMapClick : undefined}
              onPreviewDrag={isAudFormOpen ? handlePreviewDrag : undefined}
            />
          </CardContent>
        </Card>
      )}
        </div>

        {/* Right: settings */}
        <div className="space-y-6">
      {/* Auditorium editor (placed first so it is right under the map on mobile) */}
      {isAudFormOpen && (
        <div ref={audFormRef}>
          <AuditoriumForm
            form={audForm}
            onChange={setAudForm}
            buildings={map?.buildings ?? []}
            disciplines={disciplines}
            teachers={teachers}
            onSubmit={() => audMutation.mutate()}
            onCancel={closeAudForm}
            isPending={audMutation.isPending}
            error={error}
            submitLabel={editingAud ? 'Сохранить' : 'Создать'}
          />
        </div>
      )}

      {/* Buildings */}
      <Card variant="hover">
        <CardHeader className="flex items-center justify-between flex-row">
          <CardTitle>Корпуса</CardTitle>
          <Button size="sm" onClick={openCreateBuilding}>+ Корпус</Button>
        </CardHeader>
        {(showBuildingForm || editingBuilding) && (
          <form
            ref={buildingFormRef}
            onSubmit={(e) => { e.preventDefault(); buildingsMutation.mutate(); }}
            className="mb-4 rounded-xl border border-dark-border bg-dark-surface/50 p-4 space-y-4"
          >
            <Input
              label="Название"
              value={buildingForm.name}
              onChange={(e) => setBuildingForm({ ...buildingForm, name: e.target.value })}
              required
            />
            <Textarea
              label="Описание"
              value={buildingForm.description ?? ''}
              onChange={(e) => setBuildingForm({ ...buildingForm, description: e.target.value })}
              rows={2}
            />
            <Input
              label="Порядок сортировки"
              type="number"
              value={buildingForm.sortOrder}
              onChange={(e) => setBuildingForm({ ...buildingForm, sortOrder: Number(e.target.value) })}
            />
            <div className="flex gap-2">
              <Button type="submit" loading={buildingsMutation.isPending}>
                {editingBuilding ? 'Сохранить' : 'Создать'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => { setShowBuildingForm(false); setEditingBuilding(null); }}
              >
                Отмена
              </Button>
            </div>
          </form>
        )}
        <CardContent className="space-y-2">
          {(map?.buildings ?? []).length === 0 ? (
            <p className="text-dark-textMuted text-sm">Корпуса не созданы</p>
          ) : (
            map!.buildings.map((b) => (
              <div key={b.id} className="flex items-center justify-between gap-2 rounded-xl border border-dark-border bg-dark-surface px-3 py-2">
                <div className="min-w-0">
                  <p className="font-medium text-dark-text truncate">{b.name}</p>
                  {b.description && <p className="text-xs text-dark-textMuted truncate">{b.description}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Badge variant="default">{b.auditoriumCount} ауд.</Badge>
                  <Button variant="ghost" size="sm" onClick={() => openEditBuilding(b)}>✏️</Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => { if (confirm(`Удалить корпус «${b.name}» и все его аудитории?`)) deleteBuildingMutation.mutate(b.id); }}
                  >
                    🗑️
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Auditoriums */}
      <Card variant="hover">
        <CardHeader className="flex items-center justify-between flex-row">
          <CardTitle>Аудитории</CardTitle>
          <Button size="sm" onClick={openCreateAud} disabled={(map?.buildings ?? []).length === 0}>+ Аудитория</Button>
        </CardHeader>

        <CardContent className="space-y-4">
          {!isAudFormOpen && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => { setFilterBuildingId(null); setFloorFilter(null); }}
                className={`px-3 py-1.5 rounded-lg text-sm ${filterBuildingId === null ? 'bg-primary-500/20 text-primary-400' : 'text-dark-textMuted hover:text-dark-text'}`}
              >
                Все ({map?.auditoriums.length ?? 0})
              </button>
              {(map?.buildings ?? []).map((b) => (
                <button
                  key={b.id}
                  onClick={() => { setFilterBuildingId(b.id); setFloorFilter(null); }}
                  className={`px-3 py-1.5 rounded-lg text-sm ${filterBuildingId === b.id ? 'bg-primary-500/20 text-primary-400' : 'text-dark-textMuted hover:text-dark-text'}`}
                >
                  {b.name}
                </button>
              ))}
            </div>
          )}

          {auditoriums.length === 0 ? (
            <p className="text-dark-textMuted text-sm">Аудитории не найдены</p>
          ) : (
            <div className="space-y-2">
              {auditoriums.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-2 rounded-xl border border-dark-border bg-dark-surface px-3 py-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-dark-text">Ауд. {a.number}</span>
                      {a.displayName && <span className="text-sm text-dark-textMuted">{a.displayName}</span>}
                      {a.hasComputers && <Badge variant="info">ПК</Badge>}
                      {a.floor != null && <Badge variant="default">{a.floor} эт.</Badge>}
                    </div>
                    <p className="text-xs text-dark-textMuted mt-0.5">
                      {a.buildingName}
                      {a.disciplines.length > 0 && ` • ${a.disciplines.slice(0, 4).join(', ')}`}
                      {a.teachers.length > 0 && ` • ${a.teachers.length} преп.`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => openEditAud(a)}>✏️</Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => { if (confirm(`Удалить аудиторию ${a.number}?`)) deleteAudMutation.mutate(a.id); }}
                    >
                      🗑️
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
        </div>
      </div>
    </div>
  );
}
