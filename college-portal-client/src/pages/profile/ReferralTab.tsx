import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { referralsApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { formatMoscowDate } from '../../utils/datetime';
import {
  AVATAR_FRAME_COLORS,
  NICKNAME_COLOR_GROUPS,
  NICKNAME_COLOR_OPTIONS,
  REWARD_AVATAR_FRAME,
  REWARD_NICKNAME_COLOR,
  REWARD_REPORT_FORMATTER,
  frameClass,
  hasReward,
  nicknameClass,
  visibleBadges,
} from '../../utils/rewards';
import { RewardPreview } from '../../components/profile/RewardPreview';
import { saveBlobResponse } from '../../utils/download';
import type { ReferralSummaryDto, SetCosmeticsRequest, ShopResponseDto } from '../../types';
import { FunLoader } from '../../components/ambient/FunLoader';
import { PROFILE } from '../../components/ambient/loadPhrases';

const COIN_ICON = '🪙';

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
        checked ? 'border-emerald-400/60 bg-emerald-500/80' : 'border-dark-border bg-dark-border'
      }`}
    >
      <span
        aria-hidden="true"
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 7V5a2 2 0 012-2h9a2 2 0 012 2v9a2 2 0 01-2 2h-2M5 9h9a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2v-9a2 2 0 012-2z"
      />
    </svg>
  );
}

export function ReferralTab() {
  const queryClient = useQueryClient();
  const { user, refreshUser } = useAuth();
  const [copied, setCopied] = useState(false);

  const summaryQuery = useQuery<ReferralSummaryDto>({
    queryKey: ['referrals', 'me'],
    queryFn: async () => (await referralsApi.getMe()).data,
  });

  const shopQuery = useQuery<ShopResponseDto>({
    queryKey: ['referrals', 'shop'],
    queryFn: async () => (await referralsApi.getShop()).data,
  });

  const summary = summaryQuery.data;
  const shop = shopQuery.data;
  const coins = shop?.kepkaCoins ?? summary?.kepkaCoins ?? 0;
  const referralLink = summary
    ? `${window.location.origin}/r/${summary.referralCode}`
    : '';

  const copyLink = async () => {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      toast.success('Реферальная ссылка скопирована');
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Не удалось скопировать ссылку');
    }
  };

  const purchaseMutation = useMutation({
    mutationFn: (code: string) => referralsApi.purchase(code),
    onSuccess: async () => {
      toast.success('Награда получена');
      await queryClient.invalidateQueries({ queryKey: ['referrals'] });
      await queryClient.invalidateQueries({ queryKey: ['profile', 'me'] });
      void refreshUser();
    },
    onError: (error) => {
      const e = error as { response?: { data?: { error?: string } } };
      toast.error(e.response?.data?.error || 'Не удалось купить награду');
    },
  });

  const colorMutation = useMutation({
    mutationFn: (color: string | null) => referralsApi.setNicknameColor(color),
    onSuccess: async (response) => {
      if (!response.data.success) {
        toast.error(response.data.error || 'Не удалось изменить цвет никнейма');
        return;
      }
      toast.success(response.data.nicknameColor ? 'Цвет никнейма обновлён' : 'Цвет никнейма сброшен');
      await queryClient.invalidateQueries({ queryKey: ['referrals'] });
      await queryClient.invalidateQueries({ queryKey: ['profile', 'me'] });
      void refreshUser();
    },
    onError: (error) => {
      const e = error as { response?: { data?: { error?: string } } };
      toast.error(e.response?.data?.error || 'Не удалось изменить цвет никнейма');
    },
  });

  const downloadMutation = useMutation({
    mutationFn: () => referralsApi.downloadReward(REWARD_REPORT_FORMATTER),
    onSuccess: (response) => saveBlobResponse(response, 'R2F_Report_Formatter.exe'),
    onError: (error) => {
      const status = (error as { response?: { status?: number } }).response?.status;
      toast.error(
        status === 404
          ? 'Файл программы ещё не загружен на сервер. Обратитесь к администратору.'
          : 'Не удалось скачать программу',
      );
    },
  });

  const cosmeticsMutation = useMutation({
    mutationFn: (payload: SetCosmeticsRequest) => referralsApi.setCosmetics(payload),
    onSuccess: async (response) => {
      if (!response.data.success) {
        toast.error(response.data.error || 'Не удалось сохранить настройки');
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ['referrals'] });
      await queryClient.invalidateQueries({ queryKey: ['profile', 'me'] });
      void refreshUser();
    },
    onError: (error) => {
      const e = error as { response?: { data?: { error?: string } } };
      toast.error(e.response?.data?.error || 'Не удалось сохранить настройки');
    },
  });

  if (summaryQuery.isLoading || shopQuery.isLoading) {
    return <FunLoader compact pool={PROFILE} label="Загрузка рефералов" />;
  }

  if (summaryQuery.isError || shopQuery.isError || !summary || !shop) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-dark-textMuted">
          Не удалось загрузить реферальную программу. Попробуйте обновить страницу.
        </CardContent>
      </Card>
    );
  }

  const ownsColorPalette = hasReward(summary.rewardCodes, REWARD_NICKNAME_COLOR);
  const ownsFrame = hasReward(summary.rewardCodes, REWARD_AVATAR_FRAME);
  const frameColor = summary.avatarFrameColor ?? 'gold';
  const showFrame = summary.showAvatarFrame !== false;
  const showBadges = summary.showBadges !== false;
  const badges = visibleBadges(summary.rewardCodes, showBadges);
  const ownsBadges = summary.rewardCodes.some(
    (code) => code === 'ambassador-badge' || code === 'gold-badge',
  );

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <div className="bg-gradient-to-br from-primary-500/25 via-primary-500/10 to-transparent p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm text-dark-textMuted">Ваш баланс</p>
              <p className="mt-1 flex items-baseline gap-2 text-4xl font-bold text-dark-text">
                <span aria-hidden="true">{COIN_ICON}</span>
                {coins}
                <span className="text-base font-medium text-dark-textMuted">KepkaCoin</span>
              </p>
              <p className="mt-2 text-sm text-dark-textMuted">
                +1 KepkaCoin за каждого друга, который зарегистрируется по вашей ссылке.
              </p>
            </div>
            <div className="rounded-2xl border border-primary-500/30 bg-dark-card/70 px-4 py-3 text-sm text-dark-textMuted">
              Приглашено: <span className="font-semibold text-dark-text">{summary.totalInvited}</span>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Реферальная ссылка</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-dark-textMuted">
            Отправьте ссылку друзьям. Когда они зарегистрируются, вы получите KepkaCoin, а они —
            программу для оформления отчётов в подарок.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              readOnly
              value={referralLink}
              onFocus={(event) => event.currentTarget.select()}
              aria-label="Реферальная ссылка"
              className="input flex-1 font-mono text-sm"
            />
            <Button type="button" variant="secondary" onClick={() => void copyLink()}>
              <CopyIcon className="mr-2 h-4 w-4" />
              {copied ? 'Скопировано' : 'Скопировать'}
            </Button>
          </div>
          <p className="text-xs text-dark-textMuted">
            Реферальный код: <span className="font-mono">{summary.referralCode}</span>
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Магазин наград</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            {shop.items.map((item) => {
              const owned = item.purchased;
              return (
                <div
                  key={item.code}
                  className={`group relative flex flex-col gap-3 overflow-hidden rounded-2xl border p-4 transition-all duration-200 ${
                    owned
                      ? 'border-emerald-400/40 bg-emerald-400/[0.06]'
                      : 'border-dark-border bg-dark-bg hover:-translate-y-0.5 hover:border-amber-300/50 hover:shadow-[0_14px_34px_-14px_rgba(251,191,36,0.55)]'
                  }`}
                >
                  {!owned && (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute -right-12 -top-12 h-28 w-28 rounded-full bg-amber-400/10 blur-2xl transition-colors group-hover:bg-amber-300/20"
                    />
                  )}
                  <div className="flex items-start gap-3">
                    <RewardPreview code={item.code} icon={item.icon} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-dark-text">{item.title}</h3>
                        {owned && (
                          <Badge variant="success" size="sm">
                            Получено
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-dark-textMuted">
                        {item.description}
                      </p>
                    </div>
                  </div>
                  <div className="mt-auto flex items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/10 px-2.5 py-1 text-sm font-semibold text-amber-300 ring-1 ring-amber-300/25">
                      {item.price} <span aria-hidden="true">{COIN_ICON}</span>
                    </span>
                    {item.code === REWARD_REPORT_FORMATTER && owned ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        loading={downloadMutation.isPending}
                        onClick={() => downloadMutation.mutate()}
                      >
                        Скачать
                      </Button>
                    ) : owned ? (
                      <span className="text-xs text-green-400">Уже у вас</span>
                    ) : (
                      <Button
                        size="sm"
                        loading={purchaseMutation.isPending && purchaseMutation.variables === item.code}
                        disabled={coins < item.price}
                        onClick={() => purchaseMutation.mutate(item.code)}
                      >
                        Купить
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Цвет никнейма</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!ownsColorPalette ? (
            <div className="space-y-3">
              <p className="text-sm text-dark-textMuted">
                Купите «Цвет никнейма» в магазине — откроются 20 цветов, включая четыре
                переливающихся.
              </p>
              <div className="flex flex-wrap gap-2 opacity-60" aria-hidden="true">
                {NICKNAME_COLOR_OPTIONS.slice(0, 12).map((option) => (
                  <span
                    key={option.code}
                    className={`flex h-9 w-9 items-center justify-center rounded-full border border-dark-border bg-dark-bg text-xs font-bold ${nicknameClass(option.code)}`}
                  >
                    Aa
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-dark-border bg-dark-bg px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-dark-textMuted">Предпросмотр</p>
                <p
                  className={`mt-1 truncate text-lg font-semibold ${
                    nicknameClass(summary.nicknameColor) || 'text-dark-text'
                  }`}
                >
                  {user?.displayName ?? 'Ваше имя'}
                </p>
              </div>

              {NICKNAME_COLOR_GROUPS.map((group) => (
                <div key={group.title} className="space-y-2">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <p className="text-sm font-medium text-dark-text">{group.title}</p>
                    <p className="text-xs text-dark-textMuted">{group.hint}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {group.options.map((option) => {
                      const selected = summary.nicknameColor === option.code;
                      return (
                        <button
                          key={option.code}
                          type="button"
                          aria-label={option.title}
                          aria-pressed={selected}
                          title={option.title}
                          onClick={() => colorMutation.mutate(option.code)}
                          className={`flex h-11 w-11 items-center justify-center rounded-full border-2 bg-dark-bg text-xs font-bold transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${nicknameClass(
                            option.code,
                          )} ${selected ? 'border-white scale-110' : 'border-dark-border'}`}
                        >
                          Aa
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              <Button
                variant="ghost"
                size="sm"
                disabled={!summary.nicknameColor}
                onClick={() => colorMutation.mutate(null)}
              >
                Сбросить цвет
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Рамка аватара</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!ownsFrame ? (
            <p className="text-sm text-dark-textMuted">
              Купите «Золотую рамку аватара» в магазине — откроются 12 цветов металла,
              включая RGB-переливание и северное сияние.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dark-border bg-dark-bg px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-dark-text">
                    {showFrame ? 'Рамка включена' : 'Рамка отключена'}
                  </p>
                  <p className="text-xs text-dark-textMuted">
                    Можно спрятать рамку, не теряя покупку — включите её снова в любой момент.
                  </p>
                </div>
                <Toggle
                  checked={showFrame}
                  label="Показывать рамку аватара"
                  onChange={(value) => cosmeticsMutation.mutate({ showAvatarFrame: value })}
                />
              </div>

              <div className="flex items-center gap-3 rounded-xl border border-dark-border bg-dark-bg px-4 py-3">
                <div className={`avatar-frame ${frameClass(frameColor)} h-12 w-12 shrink-0`} aria-hidden="true">
                  <span className="avatar-frame__spin" />
                  <span className="avatar-frame__inner items-center justify-center bg-dark-card text-sm font-semibold">
                    Aa
                  </span>
                  <span className="avatar-frame__shine" />
                </div>
                <p className="text-xs text-dark-textMuted">
                  Предпросмотр цвета. Изменения сразу видны в профиле и на публичной странице.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {AVATAR_FRAME_COLORS.map((option) => {
                  const selected = frameColor === option.code;
                  return (
                    <button
                      key={option.code}
                      type="button"
                      aria-label={option.title}
                      aria-pressed={selected}
                      title={option.title}
                      disabled={cosmeticsMutation.isPending}
                      onClick={() => cosmeticsMutation.mutate({ avatarFrameColor: option.code })}
                      className={`flex h-11 w-11 items-center justify-center rounded-full border-2 transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:opacity-60 ${
                        selected ? 'scale-110 border-white' : 'border-dark-border'
                      }`}
                      style={{ backgroundImage: option.swatch }}
                    >
                      <span className="sr-only">{option.title}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Значки</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!ownsBadges ? (
            <p className="text-sm text-dark-textMuted">
              Купите значок амбассадора или золотой значок в магазине — потом его можно будет
              скрыть или показать здесь в любой момент.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dark-border bg-dark-bg px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-dark-text">
                    {showBadges ? 'Значки видны' : 'Значки скрыты'}
                  </p>
                  <p className="text-xs text-dark-textMuted">
                    Отключение не отменяет покупку — значки остаются в коллекции.
                  </p>
                </div>
                <Toggle
                  checked={showBadges}
                  label="Показывать значки"
                  onChange={(value) => cosmeticsMutation.mutate({ showBadges: value })}
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {badges.length === 0 ? (
                  <p className="text-xs text-dark-textMuted">
                    Сейчас значки скрыты. Включите переключатель, чтобы они снова появились.
                  </p>
                ) : (
                  badges.map((badge) => (
                    <Badge key={badge.code} variant={badge.variant} className={badge.className}>
                      {badge.label}
                    </Badge>
                  ))
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Приглашённые друзья</CardTitle>
        </CardHeader>
        <CardContent>
          {summary.invites.length === 0 ? (
            <p className="py-4 text-center text-sm text-dark-textMuted">
              Пока никого нет. Поделитесь ссылкой — первые друзья принесут KepkaCoins.
            </p>
          ) : (
            <ul className="divide-y divide-dark-border">
              {summary.invites.map((invite, index) => (
                <li key={`${invite.displayName}-${invite.joinedAt}-${index}`} className="flex items-center gap-3 py-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-dark-border text-sm font-semibold text-dark-text">
                    {invite.avatarDataUrl ? (
                      <img
                        src={invite.avatarDataUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      invite.displayName.slice(0, 2).toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-dark-text">{invite.displayName}</p>
                    <p className="text-xs text-dark-textMuted">{formatMoscowDate(invite.joinedAt)}</p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-green-400">
                    +{invite.coinsAwarded} {COIN_ICON}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {ownsFrame && showFrame && (
        <p className="text-center text-xs text-amber-300/80">
          ✨ Рамка «{AVATAR_FRAME_COLORS.find((c) => c.code === frameColor)?.title ?? 'Золото'}»
          уже сияет вокруг вашего аватара.
        </p>
      )}
    </div>
  );
}
