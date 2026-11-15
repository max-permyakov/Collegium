import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { referralsApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { clearReferralCode, normalizeReferralCode, storeReferralCode } from '../../utils/referralCode';

export function ReferralLandingPage() {
  const { code = '' } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useAuth();
  const [inviterName, setInviterName] = useState<string | null>(null);
  const [rejectedCode, setRejectedCode] = useState<string | null>(null);
  const normalized = normalizeReferralCode(code);
  const invalid = !normalized || rejectedCode === normalized;

  useEffect(() => {
    if (!normalized) return;
    storeReferralCode(normalized);

    let cancelled = false;
    referralsApi
      .validate(normalized)
      .then(({ data }) => {
        if (cancelled) return;
        if (data.valid) {
          setInviterName(data.inviterDisplayName ?? null);
        } else {
          setRejectedCode(normalized);
          clearReferralCode();
        }
      })
      .catch(() => {
        // Keep the code in storage: the claim endpoint will validate it again
        // after sign-in, and a network hiccup should not lose the invite.
        if (!cancelled) setInviterName(null);
      });

    return () => {
      cancelled = true;
    };
  }, [normalized]);

  // Signed-in visitors go straight to the referral tab, where AuthContext
  // claims the code stored above.
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate('/profile?tab=referrals', { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>{invalid ? 'Ссылка недействительна' : 'Вас пригласили в Collegium'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {invalid ? (
            <>
              <p className="text-sm text-dark-textMuted">
                Реферальный код не найден. Попросите друга прислать новую ссылку — или
                зарегистрируйтесь без неё.
              </p>
              <Button className="w-full" onClick={() => navigate('/welcome')}>
                Продолжить
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-dark-text">
                {inviterName ? (
                  <>
                    <span className="font-semibold text-primary-400">{inviterName}</span> приглашает
                    вас в студенческий портал колледжа.
                  </>
                ) : (
                  'Друг приглашает вас в студенческий портал колледжа.'
                )}
              </p>
              <div className="rounded-xl border border-primary-500/30 bg-primary-500/10 p-4 text-sm text-dark-text">
                🎁 После регистрации вы бесплатно получите программу для автоматического
                оформления отчётов.
              </div>
              <Button className="w-full" onClick={() => navigate('/welcome')}>
                Войти или зарегистрироваться
              </Button>
              <p className="text-center text-xs text-dark-textMuted">
                Код сохранится и применится автоматически после входа.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
