import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { collegeMapApi, collegeInfoApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { CollegeMap } from '../../components/college/CollegeMap';
import { AuditoriumPanel } from '../../components/college/AuditoriumPanel';
import { MapSearch } from '../../components/college/MapSearch';
import {
  AuditoriumForm,
  clamp,
  defaultAuditoriumForm,
  formFromAuditorium,
  getMapError,
  matchScheduleTeachers,
} from '../../components/college/AuditoriumForm';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import type { AuditoriumDto, CollegeMapDto, CreateAuditoriumDto, MapSearchResultDto } from '../../types';

export function CollegeMapPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { hasPermission } = useAuth();

  const [query, setQuery] = useState('');
  const [searchResult, setSearchResult] = useState<MapSearchResultDto | null>(null);
  const [searchError, setSearchError] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [buildingFilter, setBuildingFilter] = useState<string | null>(null);
  const [floorFilter, setFloorFilter] = useState<number | 'none' | null>(null);

  const { data: map, isLoading } = useQuery<CollegeMapDto>({
    queryKey: ['college-map'],
    queryFn: async () => (await collegeMapApi.getMap()).data,
    staleTime: 5 * 60 * 1000,
  });

  const auditoriumParam = searchParams.get('auditorium');
  const addNumber = searchParams.get('addNumber');
  const addLesson = searchParams.get('addLesson');
  const addTeacher = searchParams.get('addTeacher');
  const editId = searchParams.get('edit');

  const canManageMap = hasPermission('MapManage');
  const isAddMode = canManageMap && Boolean(addNumber);
  const isEditMode = canManageMap && Boolean(editId);
  const isFormMode = isAddMode || isEditMode;

  const { data: teachers } = useQuery({
    queryKey: ['college-teachers'],
    queryFn: async () => (await collegeInfoApi.getTeachers()).data,
    enabled: isFormMode,
  });
  const { data: disciplines, isPending: disciplinesPending } = useQuery({
    queryKey: ['college-map-disciplines'],
    queryFn: async () => (await collegeMapApi.getDisciplines()).data,
    enabled: isFormMode,
  });

  const [form, setForm] = useState<CreateAuditoriumDto | null>(null);
  const [editing, setEditing] = useState<AuditoriumDto | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const initKeyRef = useRef<string | null>(null);

  // Deep link (?auditorium=<id>) from the schedule or search engines:
  // select the auditorium once the map has loaded.
  useEffect(() => {
    if (!map || !auditoriumParam) return;
    if (map.auditoriums.some((a) => a.id === auditoriumParam)) {
      setSelectedId(auditoriumParam);
      setBuildingFilter(null);
      setFloorFilter(null);
    }
  }, [map, auditoriumParam]);

  // Initialize the "add" form from the schedule lesson once the map is known.
  useEffect(() => {
    if (!isAddMode || !addNumber || !map || form) return;
    const key = `add:${addNumber}:${addLesson ?? ''}:${addTeacher ?? ''}`;
    if (initKeyRef.current === key) return;
    initKeyRef.current = key;
    const base = defaultAuditoriumForm(map.buildings[0]?.id ?? '', map.mapWidth, map.mapHeight);
    const matched = teachers && addTeacher ? matchScheduleTeachers(teachers, addTeacher) : [];
    setForm({
      ...base,
      number: addNumber,
      disciplineNames: addLesson ? [addLesson] : [],
      teacherIds: matched.length > 0 ? [matched[0].id] : [],
    });
    setEditing(null);
    setFormError(null);
    setSelectedId(null);
  }, [isAddMode, addNumber, addLesson, addTeacher, map, teachers, form]);

  // The teacher list may load after the form — preselect the match then.
  useEffect(() => {
    if (!isAddMode || !form || !teachers || !addTeacher) return;
    if (form.teacherIds.length > 0) return;
    const matched = matchScheduleTeachers(teachers, addTeacher);
    if (matched.length > 0) setForm((f) => (f && f.teacherIds.length === 0 ? { ...f, teacherIds: [matched[0].id] } : f));
  }, [isAddMode, form, teachers, addTeacher]);

  // Initialize the "edit" form once the auditorium and disciplines are known.
  useEffect(() => {
    if (!isEditMode || !editId || !map || form || disciplinesPending) return;
    const key = `edit:${editId}`;
    if (initKeyRef.current === key) return;
    const auditorium = map.auditoriums.find((a) => a.id === editId);
    if (!auditorium) return;
    initKeyRef.current = key;
    const ids = auditorium.disciplines
      .map((name) => disciplines?.find((d) => d.name === name)?.id)
      .filter((id): id is string => Boolean(id));
    setForm({ ...formFromAuditorium(auditorium), disciplineIds: ids });
    setEditing(auditorium);
    setFormError(null);
  }, [isEditMode, editId, map, disciplines, disciplinesPending, form]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form) throw new Error('no form');
      if (editing) {
        return (await collegeMapApi.updateAuditorium(editing.id, form)).data;
      }
      return (await collegeMapApi.createAuditorium(form)).data;
    },
    onSuccess: async (auditorium) => {
      await queryClient.invalidateQueries({ queryKey: ['college-map'] });
      await queryClient.invalidateQueries({ queryKey: ['college-map-disciplines'] });
      navigate(`/college-info/map?auditorium=${auditorium.id}`);
    },
    onError: (e) => setFormError(getMapError(e)),
  });

  const closeForm = () => {
    const returnTo = editing?.id ?? selectedId;
    setForm(null);
    setEditing(null);
    setFormError(null);
    initKeyRef.current = null;
    navigate(`/college-info/map${returnTo ? `?auditorium=${returnTo}` : ''}`);
  };

  const selected = useMemo(
    () => map?.auditoriums.find((a) => a.id === selectedId) ?? null,
    [map, selectedId]
  );

  const highlightIds = useMemo(
    () => searchResult?.auditoriums.map((a) => a.id) ?? [],
    [searchResult]
  );

  const floors = useMemo(() => {
    const set = new Set<number>();
    let hasNone = false;
    (map?.auditoriums ?? []).forEach((a) => {
      if (buildingFilter && a.buildingId !== buildingFilter) return;
      if (a.floor == null) hasNone = true;
      else set.add(a.floor);
    });
    return { values: [...set].sort((x, y) => x - y), hasNone };
  }, [map, buildingFilter]);

  const handleSearch = async () => {
    const q = query.trim();
    if (!q) {
      setSearchError('Введите запрос для поиска');
      setSearchResult(null);
      return;
    }
    setSearchLoading(true);
    setSearchError('');
    try {
      const res = await collegeMapApi.search(q);
      setSearchResult(res.data);
      if (res.data.auditoriums.length > 0) {
        setSelectedId(res.data.auditoriums[0].id);
        setBuildingFilter(null);
        setFloorFilter(null);
      }
    } catch {
      setSearchError('Не удалось выполнить поиск');
      setSearchResult(null);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleSelect = (auditorium: AuditoriumDto) => {
    if (form) return;
    setSelectedId(auditorium.id);
  };

  const handlePick = (id: string) => {
    setSelectedId(id);
    setBuildingFilter(null);
    setFloorFilter(null);
  };

  const handleClear = () => {
    setQuery('');
    setSearchResult(null);
    setSearchError('');
  };

  const handleMapClick = (clickX: number, clickY: number) => {
    if (!form || !map) return;
    setForm({
      ...form,
      x: Math.round(clamp(clickX - form.width / 2, 0, map.mapWidth - form.width)),
      y: Math.round(clamp(clickY - form.height / 2, 0, map.mapHeight - form.height)),
    });
  };

  const handlePreviewDrag = (x: number, y: number) => {
    if (!form) return;
    setForm({ ...form, x, y });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="skeleton h-20" />
        <div className="skeleton h-[60vh] rounded-2xl" />
      </div>
    );
  }

  const showMap = map && (map.auditoriums.length > 0 || isFormMode);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-dark-text">Карта колледжа</h1>
          <p className="text-dark-textMuted">
            {isAddMode
              ? 'Добавление аудитории: заполните форму и укажите расположение на карте'
              : isEditMode
                ? 'Редактирование аудитории'
                : 'Схема корпусов и аудиторий'}
          </p>
        </div>
        {isFormMode && (
          <Button variant="ghost" size="sm" onClick={closeForm}>
            Вернуться к просмотру
          </Button>
        )}
      </div>

      {!isFormMode && map && map.buildings.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => { setBuildingFilter(null); setFloorFilter(null); }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${buildingFilter === null ? 'bg-primary-500/20 text-primary-400' : 'text-dark-textMuted hover:text-dark-text'}`}
          >
            Все корпуса
          </button>
          {map.buildings.map((b) => (
            <button
              key={b.id}
              onClick={() => { setBuildingFilter(b.id); setFloorFilter(null); }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${buildingFilter === b.id ? 'bg-primary-500/20 text-primary-400' : 'text-dark-textMuted hover:text-dark-text'}`}
            >
              {b.name}
              <span className="text-xs text-dark-textMuted ml-1">({b.auditoriumCount})</span>
            </button>
          ))}
        </div>
      )}

      {!isFormMode && map && (floors.values.length > 0 || floors.hasNone) && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-dark-textMuted uppercase tracking-wide">Этаж:</span>
          <button
            onClick={() => setFloorFilter(null)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${floorFilter === null ? 'bg-primary-500/20 text-primary-400' : 'text-dark-textMuted hover:text-dark-text'}`}
          >
            Все
          </button>
          {floors.values.map((f) => (
            <button
              key={f}
              onClick={() => setFloorFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${floorFilter === f ? 'bg-primary-500/20 text-primary-400' : 'text-dark-textMuted hover:text-dark-text'}`}
            >
              {f}
            </button>
          ))}
          {floors.hasNone && (
            <button
              onClick={() => setFloorFilter('none')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${floorFilter === 'none' ? 'bg-primary-500/20 text-primary-400' : 'text-dark-textMuted hover:text-dark-text'}`}
            >
              Без этажа
            </button>
          )}
        </div>
      )}

      {!showMap ? (
        <Card variant="hover" className="text-center py-16">
          <CardContent>
            <p className="text-lg font-semibold text-dark-text mb-1">Аудитории ещё не добавлены</p>
            <p className="text-dark-textMuted text-sm">
              Администратор может добавить корпуса и аудитории в панели администратора.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          {/* On small screens the map sticks to the top while the form is
              open, so both the map and the form stay visible. */}
          <div
            className={
              form
                ? 'sticky top-0 z-20 max-h-[45vh] overflow-y-auto rounded-2xl bg-dark-bg lg:max-h-none lg:z-auto lg:overflow-visible lg:bg-transparent'
                : undefined
            }
          >
            <CollegeMap
              map={map!}
              selectedId={selectedId}
              highlightIds={highlightIds}
              activeBuildingId={buildingFilter}
              activeFloor={floorFilter}
              onSelect={handleSelect}
              previewRect={form ? { x: form.x, y: form.y, width: form.width, height: form.height, label: form.number || '?' } : null}
              onMapClick={form ? handleMapClick : undefined}
              onPreviewDrag={form ? handlePreviewDrag : undefined}
            />
          </div>

          <div className="space-y-4">
            {form ? (
              <AuditoriumForm
                form={form}
                onChange={setForm}
                buildings={map?.buildings ?? []}
                disciplines={disciplines}
                teachers={teachers}
                onSubmit={() => saveMutation.mutate()}
                onCancel={closeForm}
                isPending={saveMutation.isPending}
                error={formError}
                submitLabel={editing ? 'Сохранить' : 'Добавить на карту'}
                hint={
                  isAddMode
                    ? 'Кликните по карте, чтобы указать расположение новой аудитории.'
                    : 'Кликните по карте, чтобы переместить аудиторию.'
                }
              />
            ) : (
              <>
                <Card variant="hover">
                  <CardContent>
                    <MapSearch
                      value={query}
                      onChange={setQuery}
                      onSubmit={handleSearch}
                      onClear={handleClear}
                      loading={searchLoading}
                      results={searchResult?.auditoriums ?? null}
                      error={searchError}
                      onPick={(a) => handlePick(a.id)}
                    />
                  </CardContent>
                </Card>

                <AuditoriumPanel auditorium={selected} />

                {selected && canManageMap && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => navigate(`/college-info/map?edit=${selected.id}`)}
                  >
                    Редактировать аудиторию
                  </Button>
                )}

                {buildingFilter && (
                  <Button variant="ghost" size="sm" onClick={() => setBuildingFilter(null)}>
                    Показать все корпуса
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
