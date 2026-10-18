import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { newsApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Avatar } from '../../components/ui/Avatar';
import { Input, Textarea } from '../../components/ui/Input';
import { KebabMenu } from '../../components/ui/KebabMenu';
import { NewsViewerModal } from '../../components/news/NewsViewerModal';
import { formatMoscowDate } from '../../utils/datetime';
import { shortName } from '../../utils/names';
import type { AnnouncementListItem, Announcement } from '../../types';

export function NewsPage() {
  const params = useParams<{ id?: string }>();
  const isDetail = !!params.id;
  const { user, hasPermission } = useAuth();
  const navigate = useNavigate();

  const [news, setNews] = useState<AnnouncementListItem[]>([]);
  const [detail, setDetail] = useState<Announcement | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewNews, setViewNews] = useState<AnnouncementListItem | null>(null);
  const [editingNews, setEditingNews] = useState(false);
  const [editForm, setEditForm] = useState({ title: '', body: '' });
  const [editError, setEditError] = useState('');

  const _formatDate = (dateStr: string) =>
    formatMoscowDate(dateStr, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const loadNews = async () => {
    setIsLoading(true);
    setError('');
    try {
      if (isDetail && params.id) {
        const response = await newsApi.getById(params.id);
        setDetail(response.data);
      } else {
        const response = await newsApi.getNews(user?.studentProfile?.studyGroupId);
        setNews(response.data || []);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Не удалось загрузить новости');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadNews();
  }, [params.id]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-20" />
        {isDetail ? <div className="skeleton h-64" /> : <div className="space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="skeleton h-20" />)}</div>}
      </div>
    );
  }

  if (error) {
    return (
      <Card variant="hover" className="text-center py-12">
        <div className="text-red-400 mb-4">{error}</div>
        <Button onClick={loadNews}>Попробовать снова</Button>
      </Card>
    );
  }

  const isAdmin = hasPermission('NewsManage');

  const saveNews = async () => {
    if (!detail) return;
    const title = editForm.title.trim();
    if (!title) {
      setEditError('Введите заголовок');
      return;
    }
    try {
      const res = await newsApi.update(detail.id, {
        title,
        body: editForm.body,
        publishedAt: detail.publishedAt,
        isPublished: detail.isPublished,
      });
      setDetail(res.data);
      setEditingNews(false);
      setEditError('');
    } catch (err: any) {
      setEditError(err.response?.data?.message || 'Не удалось сохранить');
    }
  };

  const deleteNews = async () => {
    if (!detail) return;
    if (!confirm('Удалить новость?')) return;
    try {
      await newsApi.delete(detail.id);
      navigate('/news');
    } catch (err: any) {
      setEditError(err.response?.data?.message || 'Не удалось удалить новость');
    }
  };

  if (isDetail) {
    if (!detail) {
      return (
        <Card variant="hover" className="text-center py-12">
          <p className="text-red-400">Новость не найдена</p>
          <Link to="/news"><Button variant="primary" className="mt-4">К списку новостей</Button></Link>
        </Card>
      );
    }

    return (
      <div className="space-y-6 max-w-3xl">
        <Link to="/news" className="inline-flex items-center gap-2 text-sm text-dark-textMuted hover:text-primary-400 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Назад к новостям
        </Link>

        <Card variant="hover">
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-3 flex-wrap">
                  <Badge variant={detail.isPublished ? 'success' : 'default'}>
                    {detail.isPublished ? 'Опубликовано' : 'Черновик'}
                  </Badge>
                  {detail.studyGroupName && (
                    <Badge variant="primary">{detail.studyGroupName}</Badge>
                  )}
                </div>
                <h1 className="text-2xl font-bold text-dark-text">{detail.title}</h1>
                <div className="flex items-center gap-3 text-sm text-dark-textMuted mt-2 flex-wrap">
                  <span>👤 {shortName(detail.authorName)}</span>
                  <span>📅 {_formatDate(detail.publishedAt)}</span>
                  {detail.updatedAt && <span>✏️ Обновлено {_formatDate(detail.updatedAt)}</span>}
                </div>
              </div>
              {isAdmin && (
                <KebabMenu
                  ariaLabel="Меню новости"
                  items={[
                    {
                      label: editingNews ? 'Скрыть редактирование' : 'Редактировать',
                      onClick: () => {
                        setEditForm({ title: detail.title, body: detail.body });
                        setEditError('');
                        setEditingNews((v) => !v);
                      },
                    },
                    { label: 'Удалить', danger: true, onClick: deleteNews },
                  ]}
                />
              )}
            </div>
          </CardHeader>
          {editingNews && (
            <CardContent className="border-t border-dark-border space-y-3">
              {editError && <p className="text-sm text-red-400">{editError}</p>}
              <Input
                label="Заголовок"
                value={editForm.title}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                maxLength={200}
              />
              <Textarea
                label="Текст"
                value={editForm.body}
                onChange={(e) => setEditForm({ ...editForm, body: e.target.value })}
                rows={6}
              />
              <Button onClick={saveNews}>Сохранить</Button>
            </CardContent>
          )}
          <CardContent>
            <div className="prose prose-dark max-w-none">
              <p className="whitespace-pre-wrap text-dark-text">{detail.body}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-dark-text">Новости и объявления</h1>
          <p className="text-dark-textMuted">Последние новости колледжа</p>
        </div>
      </div>

      {news.length > 0 ? (
        <div className="space-y-3">
          {news.map((item) => (
            <Card key={item.id} variant="hover" className="group">
              <button type="button" onClick={() => setViewNews(item)} className="block w-full text-left">
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <Badge variant={item.isPublished ? 'success' : 'default'}>
                          {item.isPublished ? 'Опубликовано' : 'Черновик'}
                        </Badge>
                        {item.studyGroupName && <Badge variant="primary">{item.studyGroupName}</Badge>}
                      </div>
                      <h3 className="font-medium text-dark-text group-hover:text-primary-400 transition-colors truncate">{item.title}</h3>
                      <p className="text-sm text-dark-textMuted line-clamp-2">{item.body}</p>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-dark-textMuted shrink-0">
                      <Avatar src={item.authorAvatar || undefined} name={item.authorName} size="sm" />
                      <div>
                        <p className="font-medium text-dark-text">{shortName(item.authorName)}</p>
                        <p>{_formatDate(item.publishedAt)}</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </button>
            </Card>
          ))}
        </div>
      ) : (
        <Card variant="hover" className="text-center py-12">
          <svg className="w-16 h-16 mx-auto text-dark-border mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
          </svg>
          <p className="text-dark-textMuted mb-4">Новостей пока нет</p>
        </Card>
      )}

      <NewsViewerModal announcement={viewNews} onClose={() => setViewNews(null)} />
    </div>
  );
}