/** Admin referral reporting types (mirror CollegePortal.Application/DTOs/ReferralAdminDtos.cs). */

export interface AdminReferralDailyPointDto {
  date: string;
  count: number;
}

export interface AdminTopInviterDto {
  userId: string;
  displayName: string;
  groupName?: string | null;
  referralCode?: string | null;
  invitedCount: number;
  coinsEarned: number;
  lastInviteAt?: string | null;
}

export interface AdminShopStatDto {
  code: string;
  title: string;
  price: number;
  purchasedCount: number;
  coinsSpent: number;
}

export interface AdminRecentInviteDto {
  inviterUserId: string;
  inviterName: string;
  inviteeUserId: string;
  inviteeName: string;
  inviteeGroupName?: string | null;
  coinsAwarded: number;
  createdAt: string;
}

export interface AdminRecentPurchaseDto {
  userId: string;
  userName: string;
  itemCode: string;
  itemTitle: string;
  pricePaid: number;
  purchasedAt: string;
}

export interface AdminCoinTransactionDto {
  id: string;
  userId: string;
  userName: string;
  amount: number;
  reason: string;
  createdAt: string;
}

export interface AdminReferralDashboardDto {
  totalInvites: number;
  totalCoinsEarned: number;
  totalCoinsSpent: number;
  totalGrantedCoins: number;
  coinsInCirculation: number;
  activeInviters: number;
  rewardOwners: number;
  invitesPerDay: AdminReferralDailyPointDto[];
  topInviters: AdminTopInviterDto[];
  shopStats: AdminShopStatDto[];
  recentInvites: AdminRecentInviteDto[];
  recentPurchases: AdminRecentPurchaseDto[];
  recentTransactions: AdminCoinTransactionDto[];
}

export interface AdminGrantCoinsResultDto {
  success: boolean;
  error?: string | null;
  kepkaCoins: number;
}
