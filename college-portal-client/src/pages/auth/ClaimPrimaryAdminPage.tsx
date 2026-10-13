import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../../components/ui/Card';

export function ClaimPrimaryAdminPage() {
  const { user, claimPrimaryAdmin } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await claimPrimaryAdmin(password);
      navigate('/admin', { replace: true });
    } catch (err: any) {
      if (err.response?.status === 401) {
        setError('Неверный пароль');
      } else {
        setError(err.response?.data?.message || 'Не удалось стать главным администратором');
      }
      setPassword('');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <Card variant="hover" className="w-full">
          <CardHeader className="text-center">
            <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-primary-500/20 flex items-center justify-center">
              <svg className="w-8 h-8 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622C17.176 19.29 21 14.591 21 9c0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <CardTitle>Главный администратор</CardTitle>
            <CardDescription>Введите пароль</CardDescription>
          </CardHeader>

          <CardContent>
            {user?.isProtected && (
              <div className="mb-4 p-3 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
                Вы уже главный администратор
              </div>
            )}

            {error && (
              <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm" role="alert">
                {error}
              </div>
            )}

            <form id="claim-admin-form" onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="Пароль"
                name="password"
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                placeholder="••••••••"
                required
                autoComplete="off"
                autoFocus
              />
            </form>
          </CardContent>

          <CardFooter>
            <Button type="submit" className="w-full" loading={isLoading} form="claim-admin-form">
              Стать главным администратором
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
