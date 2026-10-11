import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../../components/ui/Card';

export function LoginPage() {
  const { login, register } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    displayName: '',
    role: 'Student' as 'Student' | 'Admin',
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (isLogin) {
        await login({ email: formData.email, password: formData.password });
      } else {
        await register({
          email: formData.email,
          password: formData.password,
          displayName: formData.displayName,
          role: formData.role,
        });
      }
    } catch (err: any) {
      setError(err.response?.data?.message || (isLogin ? 'Неверный email или пароль' : 'Ошибка регистрации'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card variant="hover" className="w-full">
      <CardHeader className="text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-primary-500/20 flex items-center justify-center">
          <svg className="w-8 h-8 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5zM12 14l9-5-9-5-9 5 9 5zM12 14l9-5-9-5-9 5 9 5zM12 14l9-5-9-5-9 5 9 5zM12 14l9-5-9-5-9 5 9 5zM12 14l9-5-9-5-9 5 9 5zM12 14l9-5-9-5-9 5 9 5zM12 14l9-5-9-5-9 5 9 5zM12 14l9-5-9-5-9 5 9 5zM12 14l9-5-9-5-9 5 9 5zM12 14l9-5-9-5-9 5 9 5zM12 14l9-5-9-5-9 5 9 5zM12 14l9-5-9-5-9 5 9 5zM12 14l9-5-9-5-9 5 9 5zM12 14l9-5-9-5-9 5 9 5zM12 14l9-5-9-5-9 5 9 5z" />
          </svg>
        </div>
        <CardTitle>{isLogin ? 'Вход в портал' : 'Регистрация'}</CardTitle>
        <CardDescription>
          {isLogin
            ? 'Введите ваши учётные данные для входа'
            : 'Создайте аккаунт для доступа к порталу'}
        </CardDescription>
      </CardHeader>

      <CardContent>
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm" role="alert">
            {error}
          </div>
        )}

        <form id="login-form" onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <Input
              label="Отображаемое имя"
              name="displayName"
              type="text"
              value={formData.displayName}
              onChange={handleChange}
              placeholder="Иван Иванов"
              required={!isLogin}
              autoComplete="name"
            />
          )}

          <Input
            label="Email"
            name="email"
            type="email"
            value={formData.email}
            onChange={handleChange}
            placeholder="student@college.ru"
            required
            autoComplete="email"
          />

          <Input
            label="Пароль"
            name="password"
            type="password"
            value={formData.password}
            onChange={handleChange}
            placeholder="••••••••"
            required
            autoComplete={isLogin ? 'current-password' : 'new-password'}
            minLength={8}
          />

          {!isLogin && (
            <div>
              <label className="block text-sm font-medium text-dark-text mb-1.5">Роль</label>
              <select
                name="role"
                value={formData.role}
                onChange={handleChange}
                className="input appearance-none"
              >
                <option value="Student">Студент</option>
                <option value="Admin">Администратор</option>
              </select>
            </div>
          )}
        </form>
      </CardContent>

      <CardFooter className="flex-col gap-3">
        <Button type="submit" className="w-full" loading={isLoading} form="login-form">
          {isLogin ? 'Войти' : 'Зарегистрироваться'}
        </Button>

        <Button
          variant="ghost"
          className="w-full"
          onClick={() => { setIsLogin(!isLogin); setError(''); setFormData({ email: '', password: '', displayName: '', role: 'Student' }); }}
        >
          {isLogin ? 'Нет аккаунта? Зарегистрироваться' : 'Уже есть аккаунт? Войти'}
        </Button>
      </CardFooter>
    </Card>
  );
}