import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';

/** Sao 4 cánh nhỏ trang trí chữ, nhấp nháy nhẹ */
export const Sparkle: React.FC<{
  size: number;
  color?: string;
  style?: React.CSSProperties;
  delay?: number;
}> = ({size, color = '#ffffff', style, delay = 0}) => {
  const frame = useCurrentFrame() - delay;
  const scale = 0.8 + 0.2 * Math.sin(frame / 5);
  const opacity = interpolate(frame, [0, 5], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      style={{position: 'absolute', transform: `scale(${scale})`, opacity, ...style}}
    >
      <path
        d="M50 0 C54 36 64 46 100 50 C64 54 54 64 50 100 C46 64 36 54 0 50 C36 46 46 36 50 0Z"
        fill={color}
        stroke="#ffffff"
        strokeWidth={4}
      />
    </svg>
  );
};

/** Tim nhỏ hồng như mẫu */
export const Heart: React.FC<{size: number; style?: React.CSSProperties}> = ({size, style}) => (
  <svg width={size} height={size} viewBox="0 0 100 100" style={{position: 'absolute', ...style}}>
    <path
      d="M50 88 C20 66 4 48 4 30 C4 16 15 6 28 6 C38 6 46 12 50 20 C54 12 62 6 72 6 C85 6 96 16 96 30 C96 48 80 66 50 88Z"
      fill="#ff9cc6"
      stroke="#ffffff"
      strokeWidth={7}
    />
  </svg>
);

/** Hoa 5 cánh nhỏ hồng như mẫu */
export const Flower: React.FC<{size: number; style?: React.CSSProperties}> = ({size, style}) => (
  <svg width={size} height={size} viewBox="0 0 100 100" style={{position: 'absolute', ...style}}>
    {[0, 72, 144, 216, 288].map((a) => (
      <ellipse
        key={a}
        cx={50}
        cy={27}
        rx={17}
        ry={23}
        fill="#ffa6cb"
        stroke="#ffffff"
        strokeWidth={4}
        transform={`rotate(${a} 50 50)`}
      />
    ))}
    <circle cx={50} cy={50} r={12} fill="#fff1a8" stroke="#ffffff" strokeWidth={3} />
  </svg>
);
