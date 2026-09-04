import type { ReactNode } from 'react';

type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger';

const TONES: Record<Tone, { background: string; color: string }> = {
  neutral: { background: 'var(--neutral-100)', color: 'var(--text-secondary)' },
  brand: { background: 'var(--color-brand-soft)', color: 'var(--color-brand)' },
  success: { background: '#E4F5EA', color: 'var(--state-success)' },
  warning: { background: '#FBF0DD', color: 'var(--state-warning)' },
  danger: { background: 'var(--color-brand-soft)', color: 'var(--state-danger)' },
};

interface BadgeProps {
  tone?: Tone;
  children: ReactNode;
}

/** Santander DS `Badge` component, ported from _ds_bundle.js. */
export function Badge({ tone = 'neutral', children }: BadgeProps) {
  const t = TONES[tone];
  return (
    <span
      style={{
        fontFamily: 'var(--font-sans)',
        fontSize: 12,
        fontWeight: 500,
        padding: '4px 12px',
        borderRadius: 'var(--radius-pill)',
        display: 'inline-block',
        ...t,
      }}
    >
      {children}
    </span>
  );
}
