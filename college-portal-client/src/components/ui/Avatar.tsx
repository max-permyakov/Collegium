import type { HTMLAttributes } from 'react';
import { forwardRef } from 'react';

interface AvatarProps extends HTMLAttributes<HTMLDivElement> {
  src?: string;
  alt?: string;
  name?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  status?: 'online' | 'offline' | 'busy';
  onImageClick?: () => void;
}

export const Avatar = forwardRef<HTMLDivElement, AvatarProps>(
  ({ className = '', src, alt, name, size = 'md', status, onImageClick, ...props }, ref) => {
    const sizeClasses = {
      xs: 'w-6 h-6 text-xs',
      sm: 'w-8 h-8 text-sm',
      md: 'w-10 h-10 text-base',
      lg: 'w-12 h-12 text-lg',
      xl: 'w-16 h-16 text-xl',
    };
    const statusSizeClasses = {
      xs: 'w-1.5 h-1.5',
      sm: 'w-2 h-2',
      md: 'w-2.5 h-2.5',
      lg: 'w-3 h-3',
      xl: 'w-4 h-4',
    };

    const getInitials = (name: string) => {
      return name
        .split(' ')
        .map((part) => part[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
    };

    const getColorFromName = (name: string) => {
      const colors = [
        'bg-primary-500',
        'bg-emerald-500',
        'bg-amber-500',
        'bg-rose-500',
        'bg-violet-500',
        'bg-cyan-500',
        'bg-indigo-500',
        'bg-orange-500',
      ];
      let hash = 0;
      for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
      }
      return colors[Math.abs(hash) % colors.length];
    };

    return (
      <div
        ref={ref}
        className={`relative inline-flex items-center justify-center rounded-full overflow-hidden shrink-0 ${sizeClasses[size]} ${className}`}
        {...props}
      >
        {src ? (
          <img
            src={src}
            alt={alt || name || 'Avatar'}
            className={`w-full h-full object-cover ${onImageClick ? 'cursor-zoom-in' : ''}`}
            onClick={onImageClick}
            role={onImageClick ? 'button' : undefined}
            aria-label={onImageClick ? 'Увеличить изображение' : undefined}
          />
        ) : name ? (
          <span className={`${getColorFromName(name)} text-white font-medium w-full h-full flex items-center justify-center`}>
            {getInitials(name)}
          </span>
        ) : (
          <svg
            className="w-full h-full text-dark-textMuted"
            fill="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M24 20.993V24H0v-2.996A14.977 14.977 0 0112.004 15c4.904 0 9.26 2.354 11.996 5.993zM16 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        )}
        {status && (
          <span
            className={`absolute bottom-0 right-0 rounded-full border-2 border-dark-bg ${statusSizeClasses[size]}
              ${status === 'online' ? 'bg-green-500' : status === 'busy' ? 'bg-yellow-500' : 'bg-dark-textMuted'}`}
            aria-label={status}
          />
        )}
      </div>
    );
  }
);

Avatar.displayName = 'Avatar';