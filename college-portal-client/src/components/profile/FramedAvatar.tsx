import type { ReactNode } from 'react';
import { avatarFrameClass } from '../../utils/rewards';

interface FramedAvatarProps {
  /** Купленные награды пользователя (`rewardCodes`). */
  rewardCodes?: string[] | null;
  frameColor?: string | null;
  /** Персональный переключатель «показывать рамку». */
  enabled?: boolean | null;
  /** Размер квадрата аватара, например `h-32 w-32`. */
  className: string;
  children: ReactNode;
}

/**
 * Единая рамка аватара: та же разметка (`spin` + `inner` + `shine`), что и в
 * профиле, поэтому цвет и отключение работают одинаково во всех местах.
 * Когда рамка не куплена или выключена, дети рендерятся как есть.
 */
export function FramedAvatar({
  rewardCodes,
  frameColor,
  enabled,
  className,
  children,
}: FramedAvatarProps) {
  const frame = avatarFrameClass(rewardCodes, { color: frameColor, enabled });
  if (!frame) return <>{children}</>;

  return (
    <div className={frame}>
      <span className="avatar-frame__spin" aria-hidden="true" />
      <div className={`${className} avatar-frame__inner`}>{children}</div>
      <span className="avatar-frame__shine" aria-hidden="true" />
    </div>
  );
}
