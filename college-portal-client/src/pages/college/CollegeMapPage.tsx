import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { collegeMapApi } from '../../services/api';
import { CollegeMap } from '../../components/college/CollegeMap';
import { AuditoriumPanel } from '../../components/college/AuditoriumPanel';
import { MapSearch } from '../../components/college/MapSearch';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import type { AuditoriumDto, CollegeMapDto, MapSearchResultDto } from '../../types';

export function CollegeMapPage() {
  const [searchParams] = useSearchParams();
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

  // Deep link (?auditorium=<id>) from the schedule or search engines:
  // select the auditorium once the map has loaded.
  const auditoriumParam = searchParams.get('auditorium');
  useEffect(() => {
    if (!map || !auditoriumParam) return;
    if (map.auditoriums.some((a) => a.id === auditoriumParam)) {
      setSelectedId(auditoriumParam);
      setBuildingFilter(null);
      setFloorFilter(null);
    }
  }, [map, auditoriumParam]);

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-dark-text">Карта колледжа</h1>
          <p className="text-dark-textMuted">Схема корпусов и аудиторий</p>
        </div>
      </div>

      {map && map.buildings.length > 0 && (
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

      {map && (floors.values.length > 0 || floors.hasNone) && (
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

      {isLoading ? (
        <div className="skeleton h-[60vh] rounded-2xl" />
      ) : !map || map.auditoriums.length === 0 ? (
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
          <CollegeMap
            map={map}
            selectedId={selectedId}
            highlightIds={highlightIds}
            activeBuildingId={buildingFilter}
            activeFloor={floorFilter}
            onSelect={handleSelect}
          />

          <div className="space-y-4">
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

            {buildingFilter && (
              <Button variant="ghost" size="sm" onClick={() => setBuildingFilter(null)}>
                Показать все корпуса
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
