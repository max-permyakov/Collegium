import { Badge } from '../ui/Badge';
import {
  REWARD_AVATAR_FRAME,
  REWARD_GOLD_BADGE,
  REWARD_NICKNAME_COLOR,
  frameClass,
} from '../../utils/rewards';

interface RewardPreviewProps {
  code: string;
  icon: string;
  /** Цвет рамки для живого превью (по умолчанию золото). */
  frameColor?: string;
}

/**
 * Живое превью награды в магазине: настоящая металлическая рамка,
 * переливающийся никнейм и металлический значок вместо абстрактных эмодзи.
 */
export function RewardPreview({ code, icon, frameColor }: RewardPreviewProps) {
  if (code === REWARD_AVATAR_FRAME) {
    return (
      <div className={`avatar-frame ${frameClass(frameColor)} h-14 w-14 shrink-0`} aria-hidden="true">
        <span className="avatar-frame__spin" />
        <span className="avatar-frame__inner items-center justify-center bg-dark-card text-lg">
          🦫
        </span>
        <span className="avatar-frame__shine" />
      </div>
    );
  }

  if (code === REWARD_NICKNAME_COLOR) {
    return (
      <div
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-dark-card ring-1 ring-dark-border"
        aria-hidden="true"
      >
        <span className="nick-rgb nick-gradient text-lg font-bold">Aa</span>
      </div>
    );
  }

  if (code === REWARD_GOLD_BADGE) {
    return (
      <div className="flex h-14 w-14 shrink-0 items-center justify-center" aria-hidden="true">
        <Badge variant="warning" size="lg" className="badge-gold shadow-lg">
          ★
        </Badge>
      </div>
    );
  }

  return (
    <span
      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-dark-card text-2xl ring-1 ring-dark-border"
      aria-hidden="true"
    >
      {icon}
    </span>
  );
}
