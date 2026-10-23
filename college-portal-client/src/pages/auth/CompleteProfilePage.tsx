import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { authApi } from '../../services/api';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../../components/ui/Card';

export function CompleteProfilePage() {
  const { completeProfile, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ lastName: '', firstName: '', middleName: '', groupName: '' });
  const [groups, setGroups] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    authApi.getGroups()
      .then((response) => setGroups(response.data.groups ?? []))
      .catch(() => setGroups([]));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await completeProfile({
        lastName: form.lastName.trim(),
        firstName: form.firstName.trim(),
        middleName: form.middleName.trim() || null,
        groupName: form.groupName,
      });
      navigate('/', { replace: true });
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Не удалось сохранить профиль');
    } finally {
      setIsLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Card variant="hover">
          <CardHeader className="text-center">
            <CardTitle>Завершение регистрации</CardTitle>
            <CardDescription>
              Укажите ФИО и группу, чтобы пользоваться оценками и расписанием
            </CardDescription>
          </CardHeader>

          <CardContent>
            {error && (
              <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm" role="alert">
                {error}
              </div>
            )}

            <form id="complete-profile-form" onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  label="Фамилия"
                  value={form.lastName}
                  onChange={(e) => { setForm(prev => ({ ...prev, lastName: e.target.value })); setError(''); }}
                  required
                  autoComplete="family-name"
                  maxLength={100}
                  autoFocus
                />
                <Input
                  label="Имя"
                  value={form.firstName}
                  onChange={(e) => { setForm(prev => ({ ...prev, firstName: e.target.value })); setError(''); }}
                  required
                  autoComplete="given-name"
                  maxLength={100}
                />
              </div>
              <Input
                label="Отчество"
                value={form.middleName}
                onChange={(e) => { setForm(prev => ({ ...prev, middleName: e.target.value })); setError(''); }}
                autoComplete="additional-name"
                maxLength={100}
              />
              <div>
                <label htmlFor="complete-profile-group" className="block text-sm font-medium text-dark-text mb-1.5">
                  Группа
                </label>
                <select
                  id="complete-profile-group"
                  className="input"
                  value={form.groupName}
                  onChange={(e) => { setForm(prev => ({ ...prev, groupName: e.target.value })); setError(''); }}
                  required
                >
                  <option value="">Выберите группу</option>
                  {groups.map((group) => (
                    <option key={group} value={group}>{group}</option>
                  ))}
                </select>
              </div>
            </form>
          </CardContent>

          <CardFooter>
            <Button type="submit" className="w-full" loading={isLoading} form="complete-profile-form">
              Сохранить профиль
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
