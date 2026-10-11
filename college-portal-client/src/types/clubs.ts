export interface ClubListDto {
  id: string;
  name: string;
  description?: string | null;
  avatarDataUrl?: string | null;
  isPrivate: boolean;
  joinByLink: boolean;
  ownerId: string;
  ownerName: string;
  memberCount: number;
  isMember: boolean;
  isLeader: boolean;
  createdAt: string;
}

export interface ClubMemberDto {
  userId: string;
  displayName: string;
  avatarDataUrl?: string | null;
  isLeader: boolean;
  joinedAt: string;
}

export interface ClubMessageDto {
  id: string;
  clubId: string;
  userId: string;
  userName: string;
  userAvatar?: string | null;
  text: string;
  createdAt: string;
}

export interface ClubDetailDto {
  id: string;
  name: string;
  description?: string | null;
  avatarDataUrl?: string | null;
  isPrivate: boolean;
  joinByLink: boolean;
  inviteToken?: string | null;
  ownerId: string;
  ownerName: string;
  memberCount: number;
  isMember: boolean;
  isLeader: boolean;
  canManage: boolean;
  canJoin: boolean;
  createdAt: string;
  members: ClubMemberDto[];
}

export interface CreateClubDto {
  name: string;
  description?: string | null;
  avatarDataUrl?: string | null;
  isPrivate: boolean;
  joinByLink: boolean;
}

export interface UpdateClubDto {
  name: string;
  description?: string | null;
  avatarDataUrl?: string | null;
  isPrivate: boolean;
  joinByLink: boolean;
}
