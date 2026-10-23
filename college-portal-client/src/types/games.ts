export type GameModeId = 'physics' | '1c';

export interface GameLeaderboardEntry {
  userId: string;
  displayName: string;
  score: number;
  rank: number;
  isCurrentUser: boolean;
  achievedAt: string;
}

export interface GameLeaderboard {
  gameId: string;
  mode: GameModeId;
  entries: GameLeaderboardEntry[];
  currentUserRank: number | null;
  currentUserBest: number | null;
}

export interface GameScoreSubmission {
  score: number;
  personalBest: number;
  isPersonalBest: boolean;
  rank: number | null;
}
