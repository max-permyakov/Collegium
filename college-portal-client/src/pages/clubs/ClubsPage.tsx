import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clubsApi } from '../../services/api';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Input, Textarea } from '../../components/ui/Input';
import { Avatar } from '../../components/ui/Avatar';
import type { ClubListDto, CreateClubDto } from '../../types';

const MAX_AVATAR_SIZE = 2 * 1024 * 1024;

const getError = (err: unknown) => {
  const e = err as { response?: { data?: { message?: string } } };
  return e.response?.data?.message || 'Произошла ошибка';
};

const emptyForm: CreateClubDto = {
  name: '',
  description: '',
  avatarDataUrl: null,
  isPrivate: false,
  joinByLink: false,
};

export function ClubsPage() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState<CreateClubDto>(emptyForm);

  const { data: clubs, isLoading } = useQuery<ClubListDto[]>({
    queryKey: ['clubs'],
    queryFn: async () => (await clubsApi.getClubs()).data,
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateClubDto) => clubsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clubs'] });
      setShowCreate(false);
      setForm(emptyForm);
    },
    onError: (err) => setError(getError(err)),
  });

  const joinMutation = useMutation({
    mutationFn: (id: string) => clubsApi.join(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clubs'] }),
    onError: (err) => setError(getError(err)),
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) {
      setError('Введите название группы');
      return;
    }
    createMutation.mutate(form);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-dark-text">Кружки</h1>
          <p className="text-dark-textMuted">Клубы, сообщества и чаты студентов</p>
        </div>
        <Button onClick={() => { setShowCreate(true); setForm(emptyForm); }}>
          + Создать группу
        </Button>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center justify-between">
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={() => setError('')}>✕</Button>
        </div>
      )}

      {showCreate && (
        <Card variant="hover">
          <form onSubmit={handleCreate} className="p-4 sm:p-6 space-y-4">
            <h2 className="text-lg font-semibold text-dark-text">Новая группа</h2>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex flex-col items-center gap-2">
                <Avatar src={form.avatarDataUrl || undefined} name={form.name || '?'} size="xl" className="rounded-2xl" />
                <label className="btn-ghost text-sm cursor-pointer">
                  Фото группы
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (!file) return;
                      if (!file.type.startsWith('image/')) {
                        alert('Можно загрузить только изображение');
                        return;
                      }
                      if (file.size > MAX_AVATAR_SIZE) {
                        alert('Файл слишком большой. Максимум 2 МБ');
                        return;
                      }
                      const reader = new FileReader();
                      reader.onload = () => setForm((f) => ({ ...f, avatarDataUrl: reader.result as string }));
                      reader.readAsDataURL(file);
                    }}
                  />
                </label>
                <p className="text-xs text-dark-textMuted text-center max-w-[160px]">До 2 МБ</p>
              </div>
              <div className="flex-1 space-y-4">
                <Input
                  label="Название"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Например, Шахматный клуб"
                  required
                />
                <Textarea
                  label="Описание"
                  value={form.description ?? ''}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="О группе"
                  rows={3}
                />
                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-2 text-sm text-dark-text">
                    <input
                      type="checkbox"
                      checked={form.isPrivate}
                      onChange={(e) => setForm({ ...form, isPrivate: e.target.checked })}
                    />
                    Приватная группа (видна только участникам)
                  </label>
                  <label className="flex items-center gap-2 text-sm text-dark-text">
                    <input
                      type="checkbox"
                      checked={form.joinByLink}
                      onChange={(e) => setForm({ ...form, joinByLink: e.target.checked })}
                    />
                    Вступление по ссылке-приглашению
                  </label>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit" className="flex-1" loading={createMutation.isPending}>Создать</Button>
              <Button type="button" variant="secondary" onClick={() => { setShowCreate(false); setForm(emptyForm); }}>
                Отмена
              </Button>
            </div>
          </form>
        </Card>
      )}

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => <div key={i} className="skeleton h-40" />)}
        </div>
      ) : clubs && clubs.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {clubs.map((club) => (
            <Card key={club.id} variant="hover" className="flex flex-col">
              <CardContent className="p-4 flex flex-col gap-3 h-full">
                <div className="flex items-start gap-3">
                  <Avatar src={club.avatarDataUrl || undefined} name={club.name} size="lg" className="rounded-2xl" />
                  <div className="flex-1 min-w-0">
                    <Link to={`/clubs/${club.id}`} className="font-semibold text-dark-text hover:text-primary-400 truncate block">
                      {club.name}
                    </Link>
                    <p className="text-xs text-dark-textMuted">Глава: {club.ownerName}</p>
                  </div>
                </div>
                {club.description && (
                  <p className="text-sm text-dark-textMuted line-clamp-2">{club.description}</p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={club.isPrivate ? 'warning' : 'success'}>
                    {club.isPrivate ? 'Приватная' : 'Публичная'}
                  </Badge>
                  {club.joinByLink && <Badge variant="info">По ссылке</Badge>}
                  <Badge variant="default">👥 {club.memberCount}</Badge>
                </div>
                <div className="mt-auto flex items-center gap-2">
                  <Link to={`/clubs/${club.id}`} className="flex-1">
                    <Button variant="secondary" size="sm" className="w-full">Открыть</Button>
                  </Link>
                  {club.isMember ? (
                    <Badge variant="primary">{club.isLeader ? 'Глава' : 'Участник'}</Badge>
                  ) : (!club.isPrivate && !club.joinByLink) ? (
                    <Button size="sm" loading={joinMutation.isPending} onClick={() => joinMutation.mutate(club.id)}>
                      Вступить
                    </Button>
                  ) : (
                    <Badge variant="warning">По приглашению</Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card variant="hover" className="text-center py-12">
          <p className="text-dark-textMuted mb-4">Пока нет групп. Создайте первую!</p>
          <Button onClick={() => { setShowCreate(true); setForm(emptyForm); }}>Создать группу</Button>
        </Card>
      )}
    </div>
  );
}
