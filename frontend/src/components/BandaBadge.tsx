import type { Banda } from '../types';
import { BANDA_COLOR, BANDA_TEXT_ON } from '../lib/banda';

const SIZE_STYLES = {
  sm: 'text-xs px-2.5 py-1',
  md: 'text-sm px-3 py-1.5',
  lg: 'text-base px-4 py-2',
} as const;

interface BandaBadgeProps {
  banda: Banda;
  size?: keyof typeof SIZE_STYLES;
}

export function BandaBadge({ banda, size = 'md' }: BandaBadgeProps) {
  const bg = BANDA_COLOR[banda];
  const text = BANDA_TEXT_ON[banda];
  return (
    <span
      className={`inline-flex items-center rounded-full font-head font-bold uppercase tracking-wide ${SIZE_STYLES[size]}`}
      style={{ backgroundColor: bg, color: text }}
    >
      {banda}
    </span>
  );
}
