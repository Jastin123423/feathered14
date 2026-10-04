import React from 'react';

export interface VerifiedBadgeProps {
  /** Size in pixels (number) or CSS string (e.g. '1.05em', '19px'). Defaults to '1.05em' (matches user name font size) */
  size?: number | string;
  /** Additional CSS classes for spacing or positioning */
  className?: string;
  /** Tooltip text */
  title?: string;
  /** Primary brand fill color. Defaults to UNERA brand blue #1877F2 */
  color?: string;
}

/**
 * Modern 12-point scalloped starburst verification badge.
 * Designed with smooth, professionally rounded tips and valleys
 * and a centered, clean white checkmark.
 * Sized to match user name typography.
 */
export const VerifiedBadge: React.FC<VerifiedBadgeProps> = ({
  size = '1.05em',
  className = '',
  title = 'Verified Account',
  color = '#1877F2',
}) => {
  const pixelSize = typeof size === 'number' ? `${size}px` : size;

  return (
    <span
      className={`inline-flex items-center justify-center align-middle shrink-0 select-none ${className}`}
      style={{ width: pixelSize, height: pixelSize, minWidth: pixelSize, minHeight: pixelSize }}
      title={title}
      aria-label={title}
    >
      <svg
        viewBox="0 0 24 24"
        width="100%"
        height="100%"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="block w-full h-full drop-shadow-sm"
      >
        {/* 12-Point Scalloped Starburst Rosette with rounded tips and valleys */}
        <path
          d="M 10.85 2.14 Q 12.00 1.00 13.15 2.14 Q 14.30 3.29 15.90 2.92 Q 17.50 2.54 17.92 4.10 Q 18.34 5.66 19.90 6.10 Q 21.46 6.54 21.08 8.10 Q 20.71 9.70 21.86 10.85 Q 23.00 12.00 21.86 13.15 Q 20.71 14.30 21.08 15.90 Q 21.46 17.50 19.90 17.92 Q 18.34 18.34 17.92 19.90 Q 17.50 21.46 15.90 21.08 Q 14.30 20.71 13.15 21.86 Q 12.00 23.00 10.85 21.86 Q 9.70 20.71 8.10 21.08 Q 6.54 21.46 6.10 19.90 Q 5.66 18.34 4.10 17.92 Q 2.54 17.50 2.92 15.90 Q 3.29 14.30 2.14 13.15 Q 1.00 12.00 2.14 10.85 Q 3.29 9.70 2.92 8.10 Q 2.54 6.54 4.10 6.10 Q 5.66 5.66 6.10 4.10 Q 6.54 2.54 8.10 2.92 Q 9.70 3.29 10.85 2.14 Z"
          fill={color}
        />
        {/* Precision Centered White Tick Mark */}
        <path
          d="M 7.3 12.3 L 10.4 15.4 L 16.7 8.7"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
};

export default VerifiedBadge;
