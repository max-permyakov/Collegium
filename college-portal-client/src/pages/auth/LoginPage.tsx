import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { authApi, type AuthProvidersResponse } from '../../services/api';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../../components/ui/Card';
import logo from '../../assets/logo.png';

type LoginMode = 'diary' | 'email';
type EmailStep = 'email' | 'code' | 'register';

const OAUTH_ERRORS: Record<string, string> = {
  state: 'Сессия входа через провайдера истекла. Попробуйте снова.',
  cancelled: 'Вход через провайдера отменён.',
  exchange: 'Не удалось подтвердить вход через провайдера.',
  account: 'Не удалось войти в аккаунт.',
  provider: 'Провайдер входа не настроен.',
};

export function LoginPage() {
  const { diaryLogin, requestEmailCode, verifyEmailCode, completeEmailRegistration, sessionExpired } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const oauthEmailFallback = searchParams.get('oauth_email') === '1';
  const oauthError = searchParams.get('oauth_error');

  const [mode, setMode] = useState<LoginMode>(oauthEmailFallback ? 'email' : 'diary');
  const [diaryForm, setDiaryForm] = useState({ login: '', password: '' });
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [emailStep, setEmailStep] = useState<EmailStep>('email');
  const [registrationToken, setRegistrationToken] = useState('');
  const [profileForm, setProfileForm] = useState({ lastName: '', firstName: '', middleName: '', groupName: '' });
  const [providers, setProviders] = useState<AuthProvidersResponse | null>(null);
  const [groups, setGroups] = useState<string[]>([]);
  const [error, setError] = useState(oauthError ? OAUTH_ERRORS[oauthError] ?? 'Не удалось войти через провайдера.' : '');
  const [info, setInfo] = useState(oauthEmailFallback ? 'Провайдер не передал подтверждённую почту. Введите email — мы отправим код.' : '');
  const [isLoading, setIsLoading] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);

  useEffect(() => {
    authApi.getProviders()
      .then((response) => setProviders(response.data))
      .catch(() => setProviders({ emailEnabled: true, providers: [] }));
    authApi.getGroups()
      .then((response) => setGroups(response.data.groups ?? []))
      .catch(() => setGroups([]));
  }, []);

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = window.setTimeout(() => setResendSeconds((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [resendSeconds]);

  const clearMessages = () => {
    setError('');
    setInfo('');
  };

  const handleDiarySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    setIsLoading(true);

    try {
      await diaryLogin(diaryForm.login, diaryForm.password);
      navigate('/', { replace: true });
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Неверный логин или пароль дневника');
    } finally {
      setIsLoading(false);
    }
  };

  const sendEmailCode = async () => {
    clearMessages();
    setIsLoading(true);

    try {
      const result = await requestEmailCode(email.trim());
      if (!result.sent) {
        setError(result.message || 'Не удалось отправить код');
        return;
      }
      setEmailStep('code');
      setInfo(result.message);
      setResendSeconds(result.retryAfterSeconds ?? 60);
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Не удалось отправить код');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRequestCode = (e: React.FormEvent) => {
    e.preventDefault();
    void sendEmailCode();
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    setIsLoading(true);

    try {
      const result = await verifyEmailCode(email.trim(), code.trim());
      if (!result.success) {
        setError(result.error || 'Неверный или истёкший код');
        return;
      }

      if (result.requiresRegistration && result.registrationToken) {
        setRegistrationToken(result.registrationToken);
        setEmailStep('register');
        setInfo('Код подтверждён. Заполните профиль, чтобы завершить регистрацию.');
        return;
      }

      navigate(result.user?.requiresProfileSetup ? '/complete-profile' : '/', { replace: true });
    } catch (err) {
      const e = err as { response?: { data?: { message?: string; error?: string } } };
      setError(e.response?.data?.error || e.response?.data?.message || 'Неверный или истёкший код');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCompleteRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    setIsLoading(true);

    try {
      await completeEmailRegistration({
        registrationToken,
        lastName: profileForm.lastName.trim(),
        firstName: profileForm.firstName.trim(),
        middleName: profileForm.middleName.trim() || null,
        groupName: profileForm.groupName,
      });
      navigate('/', { replace: true });
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e.response?.data?.message || 'Не удалось завершить регистрацию');
    } finally {
      setIsLoading(false);
    }
  };

  const oauthProviders = (providers?.providers ?? []).filter((provider) => provider.enabled);
  const emailEnabled = providers?.emailEnabled !== false;

  return (
    <div className="text-center mb-6">
      <img src={logo} alt="KKEP.ka" className="w-72 h-72 max-w-full mx-auto mb-3 block object-contain" />

      <Card variant="hover" className="w-full">
        <CardHeader className="text-center">
          <CardTitle>{mode === 'diary' ? 'Вход в портал' : 'Вход по почте'}</CardTitle>
          <CardDescription>
            {mode === 'diary'
              ? 'Используйте дневник, почту или аккаунт провайдера'
              : 'Отправим одноразовый код на вашу почту'}
          </CardDescription>
        </CardHeader>

        <CardContent>
          <div className="grid grid-cols-2 gap-2 mb-5" role="tablist" aria-label="Способ входа">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'diary'}
              className={`rounded-xl px-3 py-2 text-sm font-medium transition-colors ${mode === 'diary' ? 'bg-primary-500/20 text-primary-300' : 'bg-dark-bg text-dark-textMuted hover:text-dark-text'}`}
              onClick={() => { setMode('diary'); clearMessages(); }}
            >
              Дневник
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'email'}
              className={`rounded-xl px-3 py-2 text-sm font-medium transition-colors ${mode === 'email' ? 'bg-primary-500/20 text-primary-300' : 'bg-dark-bg text-dark-textMuted hover:text-dark-text'}`}
              onClick={() => {
                setMode('email');
                clearMessages();
                if (!emailEnabled) setError('Отправка почты сейчас недоступна: SMTP не настроен.');
              }}
            >
              Почта
            </button>
          </div>

          {sessionExpired && (
            <div className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm" role="status">
              Сессия истекла, войдите заново
            </div>
          )}
          {error && (
            <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm" role="alert">
              {error}
            </div>
          )}
          {info && !error && (
            <div className="mb-4 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300 text-sm" role="status">
              {info}
            </div>
          )}

          {mode === 'diary' && (
            <form id="login-form" onSubmit={handleDiarySubmit} className="space-y-4">
              <Input
                label="Логин"
                name="login"
                type="text"
                value={diaryForm.login}
                onChange={(e) => { setDiaryForm(prev => ({ ...prev, login: e.target.value })); clearMessages(); }}
                placeholder="иванов67"
                required
                autoComplete="username"
              />
              <Input
                label="Пароль"
                name="password"
                type="password"
                value={diaryForm.password}
                onChange={(e) => { setDiaryForm(prev => ({ ...prev, password: e.target.value })); clearMessages(); }}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                minLength={1}
              />
            </form>
          )}

          {mode === 'email' && emailStep === 'email' && (
            <form id="email-form" onSubmit={handleRequestCode} className="space-y-4">
              <Input
                label="Email"
                name="email"
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); clearMessages(); }}
                placeholder="student@example.com"
                required
                autoComplete="email"
                autoFocus
              />
            </form>
          )}

          {mode === 'email' && emailStep === 'code' && (
            <form id="email-code-form" onSubmit={handleVerifyCode} className="space-y-4">
              <p className="text-sm text-dark-textMuted text-left">
                Код отправлен на <span className="text-dark-text">{email}</span>
              </p>
              <Input
                label="Код из письма"
                name="code"
                type="text"
                value={code}
                onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); clearMessages(); }}
                placeholder="000000"
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                autoFocus
              />
              <div className="flex items-center justify-between gap-2 text-sm">
                <button type="button" className="text-dark-textMuted hover:text-dark-text" onClick={() => { setEmailStep('email'); setCode(''); setResendSeconds(0); clearMessages(); }}>
                  Изменить почту
                </button>
                <button
                  type="button"
                  className="text-primary-400 hover:text-primary-300 disabled:text-dark-textMuted disabled:no-underline"
                  onClick={() => void sendEmailCode()}
                  disabled={isLoading || resendSeconds > 0}
                >
                  {resendSeconds > 0 ? `Повторить через ${resendSeconds} с` : 'Отправить ещё раз'}
                </button>
              </div>
            </form>
          )}

          {mode === 'email' && emailStep === 'register' && (
            <form id="registration-form" onSubmit={handleCompleteRegistration} className="space-y-4 text-left">
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  label="Фамилия"
                  value={profileForm.lastName}
                  onChange={(e) => { setProfileForm(prev => ({ ...prev, lastName: e.target.value })); clearMessages(); }}
                  required
                  autoComplete="family-name"
                  maxLength={100}
                />
                <Input
                  label="Имя"
                  value={profileForm.firstName}
                  onChange={(e) => { setProfileForm(prev => ({ ...prev, firstName: e.target.value })); clearMessages(); }}
                  required
                  autoComplete="given-name"
                  maxLength={100}
                />
              </div>
              <Input
                label="Отчество"
                value={profileForm.middleName}
                onChange={(e) => { setProfileForm(prev => ({ ...prev, middleName: e.target.value })); clearMessages(); }}
                autoComplete="additional-name"
                maxLength={100}
              />
              <div>
                <label htmlFor="registration-group" className="block text-sm font-medium text-dark-text mb-1.5">
                  Группа
                </label>
                <select
                  id="registration-group"
                  className="input"
                  value={profileForm.groupName}
                  onChange={(e) => { setProfileForm(prev => ({ ...prev, groupName: e.target.value })); clearMessages(); }}
                  required
                >
                  <option value="">Выберите группу</option>
                  {groups.map((group) => (
                    <option key={group} value={group}>{group}</option>
                  ))}
                </select>
              </div>
            </form>
          )}
        </CardContent>

        <CardFooter className="flex-col gap-3">
          {mode === 'diary' && (
            <Button type="submit" className="w-full" loading={isLoading} form="login-form">
              Войти через дневник
            </Button>
          )}
          {mode === 'email' && emailStep === 'email' && (
            <Button type="submit" className="w-full" loading={isLoading} form="email-form">
              Получить код
            </Button>
          )}
          {mode === 'email' && emailStep === 'code' && (
            <Button type="submit" className="w-full" loading={isLoading} form="email-code-form">
              Войти
            </Button>
          )}
          {mode === 'email' && emailStep === 'register' && (
            <Button type="submit" className="w-full" loading={isLoading} form="registration-form">
              Зарегистрироваться
            </Button>
          )}

          {oauthProviders.length > 0 && (
            <div className="w-full space-y-2">
              <div className="flex items-center gap-3 text-xs text-dark-textMuted">
                <span className="h-px flex-1 bg-dark-border" />
                или
                <span className="h-px flex-1 bg-dark-border" />
              </div>
              <div className={`grid gap-2 ${oauthProviders.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {oauthProviders.map((provider) => (
                  <a
                    key={provider.provider}
                    href={authApi.externalStartUrl(provider.provider.toLowerCase(), '/')}
                    className="btn btn-secondary w-full"
                  >
                    {provider.name}
                  </a>
                ))}
              </div>
            </div>
          )}

          <p className="text-xs text-dark-textMuted text-center">
            Данные дневника хранятся в зашифрованном виде и не передаются третьим лицам
          </p>
          <p className="text-xs text-dark-textMuted text-center">
            Код проекта доступен на <a href="https://github.com/max-permyakov/Collegium" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">GitHub</a>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
