import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../../components/ui/Card';

export function LoginPage() {
  const { diaryLogin } = useAuth();
  const [formData, setFormData] = useState({
    login: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await diaryLogin(formData.login, formData.password);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Неверный логин или пароль дневника');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full">
      <div className="text-center mb-6">
        <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-primary-500/20 flex items-center justify-center">
          <svg className="w-10 h-10 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14v4m-4 4h8" />
          </svg>
        </div>
        <h1 className="text-3xl font-bold text-dark-text">KKEP.ka</h1>
        <p className="text-sm text-dark-textMuted mt-1">Портал студента колледжа</p>
      </div>

      <Card variant="hover" className="w-full">
        <CardHeader className="text-center">
          <CardTitle>Вход через дневник</CardTitle>
          <CardDescription>
            Введите логин и пароль от электронного дневника
          </CardDescription>
        </CardHeader>

      <CardContent>
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm" role="alert">
            {error}
          </div>
        )}

        <form id="login-form" onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Логин"
            name="login"
            type="text"
            value={formData.login}
            onChange={handleChange}
            placeholder="иванов67"
            required
            autoComplete="username"
          />

          <Input
            label="Пароль"
            name="password"
            type="password"
            value={formData.password}
            onChange={handleChange}
            placeholder="••••••••"
            required
            autoComplete="current-password"
            minLength={1}
          />
        </form>
      </CardContent>

      <CardFooter className="flex-col gap-3">
        <Button type="submit" className="w-full" loading={isLoading} form="login-form">
          Войти через дневник
        </Button>
        <p className="text-xs text-dark-textMuted text-center">
          Пароль не сохраняется, используется только для входа в дневник
        </p>
        <p className="text-xs text-dark-textMuted text-center">
          Код проекта доступен на <a href="https://github.com/max-permyakov/Collegium" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">GitHub</a>
        </p>
      </CardFooter>
      </Card>
    </div>
  );
}