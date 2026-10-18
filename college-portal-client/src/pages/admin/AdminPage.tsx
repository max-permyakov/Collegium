import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { newsApi, assignmentsApi, adminApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Textarea } from '../../components/ui/Input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui/Tabs';
import { shortName } from '../../utils/names';
import { StatisticsTab } from './StatisticsTab';
import { UsersTab } from './UsersTab';
import { AuditTab } from './AuditTab';
import { ClubsTab } from './ClubsTab';
import { MapTab } from './MapTab';
import { formatMoscowDate, moscowDateTimeInputValue, moscowInputToUtc } from '../../utils/datetime';
import type { AnnouncementListItem, CreateAnnouncementDto, AssignmentListItem, CreateAssignmentDto } from '../../types';
import type { StatisticsDto } from '../../types/admin';

export function AdminPage() {
  const { hasPermission } = useAuth();
  const canManageUsers = hasPermission('UsersManage');
  const canManageNews = hasPermission('NewsManage');
  const canManageAssignments = hasPermission('AssignmentsManage');
  const canManageClubs = hasPermission('ClubsManage');
  const canManageMap = hasPermission('MapManage');
  const canViewAudit = hasPermission('AuditView');

  const [announcements, setAnnouncements] = useState<AnnouncementListItem[]>([]);
  const [assignments, setAssignments] = useState<AssignmentListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const [showCreateNews, setShowCreateNews] = useState(false);
  const [showCreateAssignment, setShowCreateAssignment] = useState(false);
  const [editingNews, setEditingNews] = useState<AnnouncementListItem | null>(null);
  const [editingAssignment, setEditingAssignment] = useState<AssignmentListItem | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const { data: statistics } = useQuery<StatisticsDto>({
    queryKey: ['admin', 'statistics'],
    queryFn: async () => (await adminApi.getStatistics()).data,
    enabled: canManageUsers,
  });
  const groups = statistics?.groups ?? [];

  const defaultTab = canManageUsers
    ? 'statistics'
    : canViewAudit
      ? 'audit'
      : canManageNews
        ? 'news'
        : canManageAssignments
          ? 'assignments'
          : canManageClubs
            ? 'clubs'
            : 'map';

  const [newsForm, setNewsForm] = useState<CreateAnnouncementDto>({
    title: '',
    body: '',
    publishedAt: moscowDateTimeInputValue(),
    studyGroupId: undefined,
    isPublished: true,
  });

  const [assignmentForm, setAssignmentForm] = useState<CreateAssignmentDto>({
    title: '',
    description: '',
    dueAt: moscowDateTimeInputValue(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
    studyGroupId: '',
  });

  const formatDate = (dateStr: string) =>
    formatMoscowDate(dateStr, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  const loadData = async () => {
    setIsLoading(true);
    setError('');
    try {
      const [newsRes, assignmentsRes] = await Promise.allSettled([
        newsApi.getNews(),
        assignmentsApi.getMyAssignments(),
      ]);
      if (newsRes.status === 'fulfilled') setAnnouncements(newsRes.value.data || []);
      if (assignmentsRes.status === 'fulfilled') setAssignments(assignmentsRes.value.data || []);
    } catch {
      setError('Не удалось загрузить данные');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleExportCsv = async () => {
    setIsExporting(true);
    setError('');
    try {
      const res = await adminApi.exportUsersCsv();
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'users.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError('Не удалось экспортировать CSV');
    } finally {
      setIsExporting(false);
    }
  };

  const handleCreateNews = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await newsApi.create({ ...newsForm, publishedAt: moscowInputToUtc(newsForm.publishedAt) });
      setShowCreateNews(false);
      setNewsForm({ title: '', body: '', publishedAt: moscowDateTimeInputValue(), studyGroupId: undefined, isPublished: true });
      loadData();
    } catch (err) {
      const e2 = err as { response?: { data?: { message?: string } } };
      setError(e2.response?.data?.message || 'Ошибка создания новости');
    }
  };

  const handleUpdateNews = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingNews) return;
    setError('');
    try {
      await newsApi.update(editingNews.id, {
        ...newsForm,
        publishedAt: moscowInputToUtc(newsForm.publishedAt),
      });
      setEditingNews(null);
      setNewsForm({ title: '', body: '', publishedAt: moscowDateTimeInputValue(), studyGroupId: undefined, isPublished: true });
      loadData();
    } catch (err) {
      const e2 = err as { response?: { data?: { message?: string } } };
      setError(e2.response?.data?.message || 'Ошибка обновления новости');
    }
  };

  const handleDeleteNews = async (id: string) => {
    if (!confirm('Удалить эту новость?')) return;
    setError('');
    try {
      await newsApi.delete(id);
      loadData();
    } catch (err) {
      const e2 = err as { response?: { data?: { message?: string } } };
      setError(e2.response?.data?.message || 'Ошибка удаления новости');
    }
  };

  const handleTogglePublished = async (id: string) => {
    setError('');
    try {
      await newsApi.togglePublished(id);
      loadData();
    } catch (err) {
      const e2 = err as { response?: { data?: { message?: string } } };
      setError(e2.response?.data?.message || 'Ошибка изменения статуса');
    }
  };

  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await assignmentsApi.createAssignment({ ...assignmentForm, dueAt: moscowInputToUtc(assignmentForm.dueAt) });
      setShowCreateAssignment(false);
      setAssignmentForm({ title: '', description: '', dueAt: moscowDateTimeInputValue(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)), studyGroupId: '' });
      loadData();
    } catch (err) {
      const e2 = err as { response?: { data?: { message?: string } } };
      setError(e2.response?.data?.message || 'Ошибка создания задания');
    }
  };

  const handleUpdateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAssignment) return;
    setError('');
    try {
      await assignmentsApi.updateAssignment(editingAssignment.id, { ...assignmentForm, dueAt: moscowInputToUtc(assignmentForm.dueAt) });
      setEditingAssignment(null);
      setAssignmentForm({ title: '', description: '', dueAt: moscowDateTimeInputValue(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)), studyGroupId: '' });
      loadData();
    } catch (err) {
      const e2 = err as { response?: { data?: { message?: string } } };
      setError(e2.response?.data?.message || 'Ошибка обновления задания');
    }
  };

  const handleDeleteAssignment = async (id: string) => {
    if (!confirm('Удалить это задание?')) return;
    setError('');
    try {
      await assignmentsApi.deleteAssignment(id);
      loadData();
    } catch (err) {
      const e2 = err as { response?: { data?: { message?: string } } };
      setError(e2.response?.data?.message || 'Ошибка удаления задания');
    }
  };

  const resetNewsForm = () => {
    setNewsForm({ title: '', body: '', publishedAt: moscowDateTimeInputValue(), studyGroupId: undefined, isPublished: true });
  };

  const resetAssignmentForm = () => {
    setAssignmentForm({ title: '', description: '', dueAt: moscowDateTimeInputValue(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)), studyGroupId: '' });
  };

  const hasDashboardTab = canManageUsers || canViewAudit || canManageNews || canManageAssignments || canManageClubs || canManageMap;

  if (!hasDashboardTab) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-dark-text">Панель администратора</h1>
        <Card variant="hover" className="text-center py-12">
          <p className="text-dark-textMuted">
            Вам выданы только права на раздел «Информация о колледже» — управляйте им на странице «Колледж».
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-dark-text">Панель администратора</h1>
          <p className="text-dark-textMuted">Пользователи, статистика, аудит, новости и задания</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManageNews && (
            <Button onClick={() => { setShowCreateNews(true); setEditingNews(null); resetNewsForm(); }}>
              + Новость
            </Button>
          )}
          {canManageAssignments && (
            <Button onClick={() => { setShowCreateAssignment(true); setEditingAssignment(null); resetAssignmentForm(); }}>
              + Задание
            </Button>
          )}
          {canManageUsers && (
            <Button variant="secondary" loading={isExporting} onClick={handleExportCsv}>
              Экспорт CSV
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center justify-between">
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={() => setError('')}>✕</Button>
        </div>
      )}

      <Tabs defaultValue={defaultTab} className="w-full">
        <TabsList className="w-full flex-wrap gap-1">
          {canManageUsers && <TabsTrigger value="statistics">📊 Статистика</TabsTrigger>}
          {canManageUsers && <TabsTrigger value="users">👥 Пользователи</TabsTrigger>}
          {canViewAudit && <TabsTrigger value="audit">🕓 Аудит</TabsTrigger>}
          {canManageNews && <TabsTrigger value="news">📰 Новости</TabsTrigger>}
          {canManageAssignments && <TabsTrigger value="assignments">📝 Задания</TabsTrigger>}
          {canManageClubs && <TabsTrigger value="clubs">🎓 Кружки</TabsTrigger>}
          {canManageMap && <TabsTrigger value="map">🗺️ Карта</TabsTrigger>}
        </TabsList>

        {canManageUsers && (
          <TabsContent value="statistics">
            <StatisticsTab />
          </TabsContent>
        )}

        {canManageUsers && (
          <TabsContent value="users">
            <UsersTab />
          </TabsContent>
        )}

        {canViewAudit && (
          <TabsContent value="audit">
            <AuditTab />
          </TabsContent>
        )}

        <TabsContent value="news">
          {canManageNews && (
          <div className="space-y-4">
            {(showCreateNews || editingNews) && (
              <Card variant="hover">
                <CardHeader>
                  <CardTitle>{editingNews ? 'Редактирование новости' : 'Создание новости'}</CardTitle>
                </CardHeader>
                <form onSubmit={editingNews ? handleUpdateNews : handleCreateNews} className="p-4 space-y-4">
                  <Input label="Заголовок" value={newsForm.title} onChange={e => setNewsForm({...newsForm, title: e.target.value})} placeholder="Заголовок новости" required />
                  <Textarea label="Текст" value={newsForm.body} onChange={e => setNewsForm({...newsForm, body: e.target.value})} placeholder="Текст новости" required rows={4} />
                  <Input label="Дата публикации" type="datetime-local" value={newsForm.publishedAt} onChange={e => setNewsForm({...newsForm, publishedAt: e.target.value})} required />
                  <div className="w-full">
                    <label className="block text-sm font-medium text-dark-text mb-1.5">Группа (необязательно)</label>
                    <select
                      className="input"
                      value={newsForm.studyGroupId ?? ''}
                      onChange={e => setNewsForm({...newsForm, studyGroupId: e.target.value || undefined})}
                    >
                      <option value="">Для всех</option>
                      {groups.map(g => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </select>
                  </div>
                  <label className="flex items-center gap-2 text-sm font-medium text-dark-text cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={newsForm.isPublished ?? false}
                      onChange={e => setNewsForm({...newsForm, isPublished: e.target.checked})}
                      className="w-4 h-4 accent-primary-500"
                    />
                    Опубликовать сразу
                  </label>
                  <div className="flex gap-2">
                    <Button type="submit" className="flex-1">{editingNews ? 'Сохранить' : 'Опубликовать'}</Button>
                    <Button type="button" variant="secondary" onClick={() => { setShowCreateNews(false); setEditingNews(null); resetNewsForm(); }}>Отмена</Button>
                  </div>
                </form>
              </Card>
            )}

            {announcements.length > 0 ? (
              <div className="space-y-2">
                {announcements.map((item) => (
                  <Card key={item.id} variant="hover">
                    <CardContent className="p-4">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <Badge variant={item.isPublished ? 'success' : 'default'}>
                              {item.isPublished ? 'Опубликовано' : 'Черновик'}
                            </Badge>
                            {item.studyGroupName && <Badge variant="primary">{item.studyGroupName}</Badge>}
                          </div>
                          <h3 className="font-medium text-dark-text truncate">{item.title}</h3>
                          <p className="text-sm text-dark-textMuted line-clamp-1">{item.body}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-sm text-dark-textMuted">{formatDate(item.publishedAt)}</span>
                          <Button variant="ghost" size="sm" onClick={() => handleTogglePublished(item.id)}>
                            {item.isPublished ? 'Снять' : 'Опубликовать'}
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => { setEditingNews(item); setNewsForm({ title: item.title, body: item.body, publishedAt: moscowDateTimeInputValue(new Date(item.publishedAt)), studyGroupId: item.studyGroupId, isPublished: item.isPublished }); }}>
                            ✏️
                          </Button>
                          <Button variant="danger" size="sm" onClick={() => handleDeleteNews(item.id)}>🗑️</Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card variant="hover" className="text-center py-12">
                <p className="text-dark-textMuted mb-4">Нет новостей</p>
                <Button onClick={() => { setShowCreateNews(true); setEditingNews(null); resetNewsForm(); }}>
                  Создать первую новость
                </Button>
              </Card>
            )}
          </div>
          )}
        </TabsContent>

        <TabsContent value="assignments">
          {canManageAssignments && (
          <div className="space-y-4">
            {(showCreateAssignment || editingAssignment) && (
              <Card variant="hover">
                <CardHeader>
                  <CardTitle>{editingAssignment ? 'Редактирование задания' : 'Создание задания'}</CardTitle>
                </CardHeader>
                <form onSubmit={editingAssignment ? handleUpdateAssignment : handleCreateAssignment} className="p-4 space-y-4">
                  <Input label="Название" value={assignmentForm.title} onChange={e => setAssignmentForm({...assignmentForm, title: e.target.value})} placeholder="Название задания" required />
                  <Textarea label="Описание" value={assignmentForm.description} onChange={e => setAssignmentForm({...assignmentForm, description: e.target.value})} placeholder="Описание задания" required rows={3} />
                  <Input label="Срок сдачи" type="datetime-local" value={assignmentForm.dueAt} onChange={e => setAssignmentForm({...assignmentForm, dueAt: e.target.value})} required />
                  <div className="w-full">
                    <label className="block text-sm font-medium text-dark-text mb-1.5">Учебная группа</label>
                    <select
                      className="input"
                      value={assignmentForm.studyGroupId}
                      onChange={e => setAssignmentForm({...assignmentForm, studyGroupId: e.target.value})}
                      required
                    >
                      <option value="">Выберите группу</option>
                      {groups.map(g => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit" className="flex-1">{editingAssignment ? 'Сохранить' : 'Создать'}</Button>
                    <Button type="button" variant="secondary" onClick={() => { setShowCreateAssignment(false); setEditingAssignment(null); resetAssignmentForm(); }}>Отмена</Button>
                  </div>
                </form>
              </Card>
            )}

            {isLoading ? (
              <div className="skeleton h-32" />
            ) : assignments.length > 0 ? (
              <div className="space-y-2">
                {assignments.map((item) => (
                  <Card key={item.id} variant="hover">
                    <CardContent className="p-4">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant={new Date(item.dueAt) < new Date() ? 'danger' : 'primary'}>
                              {new Date(item.dueAt) < new Date() ? 'Просрочено' : 'Активно'}
                            </Badge>
                          </div>
                          <h3 className="font-medium text-dark-text truncate">{item.title}</h3>
                          <p className="text-sm text-dark-textMuted line-clamp-1 mt-1">{item.description}</p>
                          <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-dark-textMuted">
                            <span>📚 {item.studyGroupName}</span>
                            <span>👨‍🏫 {shortName(item.createdByName)}</span>
                            <span>📅 {formatDate(item.dueAt)}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Button variant="ghost" size="sm" onClick={() => { setEditingAssignment(item); setAssignmentForm({ title: item.title, description: item.description, dueAt: moscowDateTimeInputValue(new Date(item.dueAt)), studyGroupId: item.studyGroupId }); }}>
                            ✏️
                          </Button>
                          <Button variant="danger" size="sm" onClick={() => handleDeleteAssignment(item.id)}>🗑️</Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card variant="hover" className="text-center py-12">
                <p className="text-dark-textMuted mb-4">Нет заданий</p>
                <Button onClick={() => { setShowCreateAssignment(true); setEditingAssignment(null); resetAssignmentForm(); }}>
                  Создать первое задание
                </Button>
              </Card>
            )}
          </div>
          )}
        </TabsContent>

        <TabsContent value="clubs">
          {canManageClubs && <ClubsTab />}
        </TabsContent>

        <TabsContent value="map">
          {canManageMap && <MapTab />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
