type BadgeVariant = 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

export interface NicknameColorOption {
  code: string;
  title: string;
  /** Анимированный градиент вместо плоского цвета (класс `nick-gradient`). */
  animated?: boolean;
}

/**
 * Плоские цвета. Коды должны совпадать с `ReferralShopCatalog.NicknameColors`
 * на сервере — они хранятся в `ApplicationUser.NicknameColor`.
 */
const FLAT_NICKNAME_COLORS: NicknameColorOption[] = [
  { code: 'violet', title: 'Фиолетовый' },
  { code: 'indigo', title: 'Индиго' },
  { code: 'blue', title: 'Синий' },
  { code: 'sky', title: 'Небесный' },
  { code: 'cyan', title: 'Голубой' },
  { code: 'teal', title: 'Бирюзовый' },
  { code: 'emerald', title: 'Изумрудный' },
  { code: 'lime', title: 'Лаймовый' },
  { code: 'amber', title: 'Янтарный' },
  { code: 'orange', title: 'Оранжевый' },
  { code: 'rose', title: 'Розовый' },
  { code: 'pink', title: 'Розовый закат' },
  { code: 'fuchsia', title: 'Фуксия' },
  { code: 'red', title: 'Алый' },
  { code: 'pearl', title: 'Жемчужный' },
  { code: 'slate', title: 'Стальной' },
];

const ANIMATED_NICKNAME_COLORS: NicknameColorOption[] = [
  { code: 'rgb', title: 'RGB-переливание', animated: true },
  { code: 'gold', title: 'Жидкое золото', animated: true },
  { code: 'aurora', title: 'Северное сияние', animated: true },
  { code: 'holo', title: 'Голограмма', animated: true },
];

export const NICKNAME_COLOR_OPTIONS: NicknameColorOption[] = [
  ...FLAT_NICKNAME_COLORS,
  ...ANIMATED_NICKNAME_COLORS,
];

/** Палитра, сгруппированная для витрины в профиле. */
export const NICKNAME_COLOR_GROUPS: { title: string; hint: string; options: NicknameColorOption[] }[] = [
  {
    title: 'Спокойные цвета',
    hint: 'ровный цвет',
    options: FLAT_NICKNAME_COLORS,
  },
  {
    title: 'Переливание',
    hint: 'Для настоящих ценителей',
    options: ANIMATED_NICKNAME_COLORS,
  },
];

export const REWARD_REPORT_FORMATTER = 'report-formatter';
export const REWARD_AMBASSADOR_BADGE = 'ambassador-badge';
export const REWARD_AVATAR_FRAME = 'avatar-frame';
export const REWARD_NICKNAME_COLOR = 'nickname-color';
export const REWARD_GOLD_BADGE = 'gold-badge';

/** CSS-классы цвета никнейма (объявлены в `index.css`). */
export function nicknameClass(code?: string | null): string {
  if (!code) return '';
  const option = NICKNAME_COLOR_OPTIONS.find((item) => item.code === code);
  if (!option) return '';
  return option.animated ? `nick-${option.code} nick-gradient` : `nick-${option.code}`;
}

export function hasReward(codes: string[] | null | undefined, code: string): boolean {
  return codes?.includes(code) ?? false;
}

export function hasAvatarFrame(codes: string[] | null | undefined): boolean {
  return hasReward(codes, REWARD_AVATAR_FRAME);
}

export interface ProfileBadge {
  code: string;
  label: string;
  variant: BadgeVariant;
  /** Дополнительный металлический/анимированный стиль. */
  className?: string;
}

/** Reward badges rendered next to the display name. */
export function profileBadges(codes: string[] | null | undefined): ProfileBadge[] {
  const badges: ProfileBadge[] = [];
  if (hasReward(codes, REWARD_AMBASSADOR_BADGE)) {
    badges.push({ code: REWARD_AMBASSADOR_BADGE, label: 'Амбассадор', variant: 'info' });
  }
  if (hasReward(codes, REWARD_GOLD_BADGE)) {
    badges.push({
      code: REWARD_GOLD_BADGE,
      label: '★ Золотой',
      variant: 'warning',
      className: 'badge-gold',
    });
  }
  return badges;
}
