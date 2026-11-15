import { memo } from 'react';
import { nicknameClass } from '../../utils/rewards';

interface NicknameProps {
  children: string;
  /** Код цвета из палитры наград. */
  color?: string | null;
  /** Дополнительные Tailwind-классы (цвет по умолчанию, размер и т.п.). */
  className?: string;
  title?: string;
}

/**
 * Имя пользователя с купленным цветом. Используется везде, где показывается
 * ник: профиль, чаты, клубы, рейтинг, лидерборд, комментарии. Если цвет не
 * выбран, рендерится обычный текст с переданными классами.
 */
export const Nickname = memo(function Nickname({ children, color, className = '', title }: NicknameProps) {
  const colored = nicknameClass(color);
  return (
    <span className={`${colored || 'text-dark-text'} ${className}`} title={title}>
      {children}
    </span>
  );
});
