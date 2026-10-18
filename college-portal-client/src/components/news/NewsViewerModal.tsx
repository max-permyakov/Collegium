import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { newsApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Avatar } from '../ui/Avatar';
import { Input } from '../ui/Input';
import { KebabMenu } from '../ui/KebabMenu';
import { formatMoscowDateTime } from '../../utils/datetime';
import { shortName } from '../../utils/names';
import type { AnnouncementListItem } from '../../types';

interface NewsViewerModalProps {
  announcement: AnnouncementListItem | null;
  onClose: () => void;
}

const getError = (err: unknown) => {
  const e = err as { response?: { data?: { message?: string } } };
  return e.response?.data?.message || 'Произошла ошибка';
};

const formatDateTime = (value: string) =>
  formatMoscowDateTime(value, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export function NewsViewerModal({ announcement, onClose }: NewsViewerModalProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [commentText, setCommentText] = useState('');
  const [error, setError] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentText, setEditCommentText] = useState('');
  const newsId = announcement?.id ?? null;

  useEffect(() => {
    if (!newsId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [newsId, onClose]);

  const { data: comments, isLoading: commentsLoading } = useQuery({
    queryKey: ['news-comments', newsId],
    queryFn: async () => (await newsApi.getComments(newsId!)).data,
    enabled: Boolean(newsId),
    retry: false,
  });

  const invalidateComments = () => queryClient.invalidateQueries({ queryKey: ['news-comments', newsId] });

  const postMutation = useMutation({
    mutationFn: (text: string) => newsApi.postComment(newsId!, text),
    onSuccess: () => { setCommentText(''); setError(''); invalidateComments(); },
    onError: (err) => setError(getError(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (commentId: string) => newsApi.deleteComment(commentId),
    onSuccess: () => { setEditingCommentId(null); invalidateComments(); },
    onError: (err) => setError(getError(err)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ commentId, text }: { commentId: string; text: string }) => newsApi.updateComment(commentId, text),
    onSuccess: () => { setEditingCommentId(null); setError(''); invalidateComments(); },
    onError: (err) => setError(getError(err)),
  });

  if (!announcement) return null;

  const submitComment = () => {
    const text = commentText.trim();
    if (!text || postMutation.isPending) return;
    postMutation.mutate(text);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8 bg-black/85 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Просмотр новости"
    >
      <button
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-dark-card border border-dark-border text-dark-textMuted hover:text-dark-text hover:bg-dark-border transition-colors flex items-center justify-center text-lg"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        aria-label="Закрыть"
      >
        ✕
      </button>

      <div
        className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl bg-dark-card border border-dark-border p-4 sm:p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-3 flex-wrap pr-10">
          {announcement.studyGroupName && <Badge variant="primary">{announcement.studyGroupName}</Badge>}
          <Badge variant="info">{formatDateTime(announcement.publishedAt)}</Badge>
        </div>

        <h2 className="text-xl font-bold text-dark-text">{announcement.title}</h2>
        <Link
          to={`/users/${announcement.authorId}`}
          onClick={onClose}
          className="flex items-center gap-3 mt-3 group min-w-0"
        >
          <Avatar src={announcement.authorAvatar || undefined} name={announcement.authorName} size="md" />
          <span className="text-sm font-medium text-dark-text group-hover:text-primary-400 transition-colors truncate">
            {shortName(announcement.authorName)}
          </span>
        </Link>
        <p className="text-dark-text whitespace-pre-wrap break-words mt-4">{announcement.body}</p>

        <div className="border-t border-dark-border mt-5 pt-4">
          <p className="text-sm font-semibold text-dark-text mb-3">
            Комментарии {comments ? `(${comments.length})` : ''}
          </p>

          {error && <p className="text-sm text-red-400 mb-2">{error}</p>}

          <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
            {commentsLoading ? (
              <div className="space-y-3">
                <div className="skeleton h-14" />
                <div className="skeleton h-14" />
              </div>
            ) : comments && comments.length > 0 ? (
              comments.map(c => (
                <div key={c.id} className="flex gap-3">
                  <Link to={`/users/${c.userId}`} onClick={onClose} className="shrink-0">
                    <Avatar src={c.userAvatar || undefined} name={c.userName} size="sm" />
                  </Link>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        to={`/users/${c.userId}`}
                        onClick={onClose}
                        className="text-sm font-medium text-dark-text hover:text-primary-400 transition-colors truncate"
                      >
                        {shortName(c.userName)}
                      </Link>
                      <span className="text-xs text-dark-textMuted">
                        {formatDateTime(c.createdAt)}{c.updatedAt && ' (изм.)'}
                      </span>
                      {(user?.id === c.userId || user?.role === 'Admin') && (
                        <KebabMenu
                          ariaLabel="Действия с комментарием"
                          items={[
                            {
                              label: 'Редактировать',
                              onClick: () => { setEditCommentText(c.text); setEditingCommentId(c.id); },
                            },
                            {
                              label: 'Удалить',
                              danger: true,
                              onClick: () => { if (confirm('Удалить комментарий?')) deleteMutation.mutate(c.id); },
                            },
                          ]}
                        />
                      )}
                    </div>
                    {editingCommentId === c.id ? (
                      <div className="mt-1 space-y-2">
                        <textarea
                          className="input h-20 resize-none text-sm"
                          value={editCommentText}
                          onChange={(e) => setEditCommentText(e.target.value)}
                          maxLength={2000}
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            disabled={!editCommentText.trim() || updateMutation.isPending}
                            loading={updateMutation.isPending}
                            onClick={() => {
                              const text = editCommentText.trim();
                              if (text) updateMutation.mutate({ commentId: c.id, text });
                            }}
                          >
                            Сохранить
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => setEditingCommentId(null)}>Отмена</Button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-dark-text whitespace-pre-wrap break-words">{c.text}</p>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-dark-textMuted">Пока нет комментариев</p>
            )}
          </div>

          {user ? (
            <div className="flex gap-2 mt-4">
              <Input
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                placeholder="Написать комментарий..."
                maxLength={2000}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    submitComment();
                  }
                }}
              />
              <Button
                onClick={submitComment}
                loading={postMutation.isPending}
                disabled={!commentText.trim()}
              >
                Отправить
              </Button>
            </div>
          ) : (
            <p className="text-sm text-dark-textMuted mt-4">Войдите, чтобы оставить комментарий</p>
          )}
        </div>
      </div>
    </div>
  );
}
