import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { collegeInfoApi, adminApi } from '../../services/api';
import { notifyFailure, notifySuccess } from '../../utils/notify';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Input } from '../../components/ui/Input';
import { Avatar } from '../../components/ui/Avatar';
import { Lightbox } from '../../components/ui/Lightbox';
import { useAuth } from '../../context/AuthContext';
import type { CollegeCatalog } from '../../types';

type SearchType = 'group' | 'teacher' | 'audience';

const getError = (err: unknown) => {
  const e = err as { response?: { data?: { message?: string } } };
  return e.response?.data?.message || 'Произошла ошибка';
};

const typeLabels: Record<SearchType, string> = {
  group: 'Группа',
  teacher: 'Преподаватель',
  audience: 'Аудитория',
};

const formatTime = (value: string) => (value ? value.slice(0, 5) : '');

export function CollegeInfoPage() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = hasPermission('CollegeInfoManage');

  const [tab, setTab] = useState<'schedule' | 'teachers'>('schedule');
  const [searchType, setSearchType] = useState<SearchType>('group');
  const [query, setQuery] = useState('');
  const [date, setDate] = useState('');
  const [result, setResult] = useState<Awaited<ReturnType<typeof collegeInfoApi.searchSchedule>>['data'] | null>(null);
  const [searchError, setSearchError] = useState('');
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [teacherFilter, setTeacherFilter] = useState('');
  const [actionMessage, setActionMessage] = useState('');

  const { data: catalog } = useQuery<CollegeCatalog>({
    queryKey: ['college-catalog'],
    queryFn: async () => (await collegeInfoApi.getCatalog()).data,
    staleTime: 60 * 60 * 1000,
  });

  const { data: teachers, isLoading: teachersLoading } = useQuery({
    queryKey: ['college-teachers'],
    queryFn: async () => (await collegeInfoApi.getTeachers()).data,
  });

  const searchMutation = useMutation({
    mutationFn: () => collegeInfoApi.searchSchedule(searchType, query, date || undefined),
    onSuccess: (res) => {
      setResult(res.data);
      setSearchError('');
    },
    onError: (err) => {
      setResult(null);
      setSearchError(getError(err));
    },
  });

  const refreshTeachersMutation = useMutation({
    mutationFn: () => adminApi.refreshCollegeTeachers(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['college-teachers'] });
      setActionMessage('Список преподавателей обновлён');
      notifySuccess('Список преподавателей обновлён');
    },
    onError: (err) => {
      setActionMessage(`Ошибка: ${getError(err)}`);
      notifyFailure(err, 'Не удалось обновить список преподавателей');
    },
  });

  const options = useMemo(() => {
    if (!catalog) return [];
    if (searchType === 'group') return catalog.groups;
    if (searchType === 'teacher') return catalog.teachers;
    return catalog.audiences;
  }, [catalog, searchType]);

  const filteredTeachers = useMemo(() => {
    if (!teachers) return [];
    const q = teacherFilter.trim().toLowerCase();
    if (!q) return teachers;
    return teachers.filter(
      (t) =>
        t.fullName.toLowerCase().includes(q) ||
        (t.position ?? '').toLowerCase().includes(q) ||
        t.disciplines.some((d) => d.toLowerCase().includes(q))
    );
  }, [teachers, teacherFilter]);

  const handleSearch = (e?: React.FormEvent) => {
    e?.preventDefault();
    setSearchError('');
    if (!query.trim()) {
      setSearchError('Введите запрос для поиска');
      return;
    }
    searchMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-dark-text">Информация о колледже</h1>
          <p className="text-dark-textMuted">Расписание занятий и преподаватели</p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/college-info/map">
            <Button variant="secondary">Карта колледжа</Button>
          </Link>
        </div>
      </div>

      <div className="flex gap-2 rounded-xl bg-dark-border/40 p-1 w-fit">
        <button
          onClick={() => setTab('schedule')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'schedule' ? 'bg-primary-500/20 text-primary-400' : 'text-dark-textMuted hover:text-dark-text'}`}
        >
          Расписание
        </button>
        <button
          onClick={() => setTab('teachers')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'teachers' ? 'bg-primary-500/20 text-primary-400' : 'text-dark-textMuted hover:text-dark-text'}`}
        >
          Преподаватели
        </button>
      </div>

      {actionMessage && (
        <div className="p-3 rounded-xl bg-primary-500/10 border border-primary-500/20 text-primary-400 text-sm flex items-center justify-between">
          <span>{actionMessage}</span>
          <Button variant="ghost" size="sm" onClick={() => setActionMessage('')}>✕</Button>
        </div>
      )}

      {tab === 'schedule' && (
        <>
          <Card variant="hover">
            <form onSubmit={handleSearch} className="p-4 sm:p-6 space-y-4">
              <div className="grid gap-4 sm:grid-cols-4">
                <div>
                  <label className="block text-sm font-medium text-dark-text mb-1">Тип поиска</label>
                  <select
                    value={searchType}
                    onChange={(e) => { setSearchType(e.target.value as SearchType); setResult(null); }}
                    className="w-full rounded-xl bg-dark-surface border border-dark-border px-3 py-2.5 text-sm text-dark-text focus:outline-none focus:border-primary-500"
                  >
                    <option value="group">Группа</option>
                    <option value="teacher">Преподаватель</option>
                    <option value="audience">Аудитория</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <Input
                    label={typeLabels[searchType]}
                    list="college-catalog-options"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={searchType === 'group' ? 'Например, 11-Пр' : searchType === 'teacher' ? 'Например, Иванов' : 'Например, 22'}
                  />
                  <datalist id="college-catalog-options">
                    {options.map((o) => <option key={o} value={o} />)}
                  </datalist>
                </div>
                <div>
                  <Input
                    label="Дата"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="submit" loading={searchMutation.isPending}>Найти</Button>
                {query && (
                  <Button type="button" variant="secondary" onClick={() => { setQuery(''); setResult(null); }}>
                    Сбросить
                  </Button>
                )}
              </div>
            </form>
          </Card>

          {searchError && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center justify-between">
              <span>{searchError}</span>
              <Button variant="ghost" size="sm" onClick={() => setSearchError('')}>✕</Button>
            </div>
          )}

          {result && (
            <Card>
              <CardContent className="p-4 sm:p-6">
                {result.lessons.length === 0 ? (
                  <p className="text-dark-textMuted text-center py-8">На выбранную дату занятий нет</p>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                      <h2 className="text-lg font-semibold text-dark-text">
                        {typeLabels[result.type as SearchType]}: <span className="text-primary-400">{result.query}</span>
                      </h2>
                      <Badge variant="info">{result.date}</Badge>
                    </div>
                    {result.lessons.map((lesson, i) => (
                      <div
                        key={i}
                        className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-xl border border-dark-border bg-dark-surface p-3"
                      >
                        <div className="flex items-center gap-3 sm:w-44 sm:flex-shrink-0">
                          <span className="text-primary-400 font-semibold">{formatTime(lesson.startTime)}</span>
                          <span className="text-dark-textMuted">–</span>
                          <span className="text-dark-textMuted">{formatTime(lesson.endTime)}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-dark-text">{lesson.name}</p>
                          <p className="text-xs text-dark-textMuted">
                            {lesson.teacherName ?? '—'}
                            {lesson.audience ? ` • ${lesson.audience}` : ''}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {tab === 'teachers' && (
        <>
          {isAdmin && (
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-xs text-dark-textMuted">Данные загружаются с сайта колледжа (gosuslugi)</p>
              <Button size="sm" variant="secondary" loading={refreshTeachersMutation.isPending} onClick={() => refreshTeachersMutation.mutate()}>
                Обновить список
              </Button>
            </div>
          )}
          <Input
            value={teacherFilter}
            onChange={(e) => setTeacherFilter(e.target.value)}
            placeholder="Поиск по имени, должности или дисциплине"
          />
          {teachersLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton h-44" />)}
            </div>
          ) : filteredTeachers.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filteredTeachers.map((teacher) => (
                <Card key={teacher.id} variant="hover" className="flex flex-col">
                  <CardContent className="p-4 flex flex-col gap-3 h-full">
                    <div className="flex items-start gap-3">
                      <Avatar
                        src={teacher.photoUrl || undefined}
                        name={teacher.fullName}
                        size="lg"
                        className="rounded-2xl"
                        onImageClick={() => teacher.photoUrl && setPreviewImage(teacher.photoUrl)}
                      />
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-dark-text">{teacher.fullName}</h3>
                        {teacher.position && <p className="text-xs text-dark-textMuted">{teacher.position}</p>}
                      </div>
                    </div>
                    {teacher.disciplines.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {teacher.disciplines.slice(0, 8).map((d) => (
                          <Badge key={d} variant="primary">{d}</Badge>
                        ))}
                        {teacher.disciplines.length > 8 && (
                          <Badge variant="default">+{teacher.disciplines.length - 8}</Badge>
                        )}
                      </div>
                    )}
                    <div className="mt-auto space-y-1 text-sm">
                      {teacher.phone && <a className="block text-primary-400 hover:underline" href={`tel:${teacher.phone}`}>📞 {teacher.phone}</a>}
                      {teacher.email && <a className="block text-primary-400 hover:underline truncate" href={`mailto:${teacher.email}`}>{teacher.email}</a>}
                      {teacher.pageUrl && (
                        <a className="block text-dark-textMuted hover:text-primary-400 text-xs" href={teacher.pageUrl} target="_blank" rel="noreferrer">
                          Профиль на сайте колледжа ↗
                        </a>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card variant="hover" className="text-center py-12">
              <p className="text-dark-textMuted mb-4">Преподаватели не найдены</p>
              {isAdmin && <Button onClick={() => refreshTeachersMutation.mutate()}>Загрузить список</Button>}
            </Card>
          )}
          <p className="text-xs text-dark-textMuted">
            Список взят с официального сайта колледжа. Набор дисциплин определяется по расписанию kkepik.
          </p>
        </>
      )}

      <Lightbox src={previewImage} alt="Фото преподавателя" onClose={() => setPreviewImage(null)} />
    </div>
  );
}