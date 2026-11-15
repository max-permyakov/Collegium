/** One user who joined through the current user's referral link. */
export interface ReferralInviteDto {
  displayName: string;
  avatarDataUrl?: string | null;
  joinedAt: string;
  coinsAwarded: number;
}

export interface ReferralSummaryDto {
  referralCode: string;
  kepkaCoins: number;
  totalInvited: number;
  invites: ReferralInviteDto[];
  rewardCodes: string[];
  nicknameColor?: string | null;
  avatarFrameColor?: string | null;
  showAvatarFrame?: boolean;
  showBadges?: boolean;
}

export interface ShopItemDto {
  code: string;
  title: string;
  description: string;
  icon: string;
  price: number;
  purchased: boolean;
}

export interface ShopResponseDto {
  kepkaCoins: number;
  items: ShopItemDto[];
}

export interface PurchaseResultDto {
  success: boolean;
  error?: string | null;
  kepkaCoins: number;
  itemCode?: string | null;
}

export interface ClaimReferralResultDto {
  success: boolean;
  error?: string | null;
  coinsAwarded: number;
  alreadyClaimed: boolean;
}

export interface ReferralCodeValidationDto {
  valid: boolean;
  inviterDisplayName?: string | null;
}

export interface NicknameColorResultDto {
  success: boolean;
  error?: string | null;
  nicknameColor?: string | null;
}

export interface SetCosmeticsRequest {
  avatarFrameColor?: string | null;
  showAvatarFrame?: boolean | null;
  showBadges?: boolean | null;
}

export interface CosmeticsResultDto {
  success: boolean;
  error?: string | null;
  avatarFrameColor?: string | null;
  showAvatarFrame: boolean;
  showBadges: boolean;
}
