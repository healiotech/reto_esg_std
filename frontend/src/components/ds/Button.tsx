import type { CSSProperties, MouseEvent, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'dark';
type Size = 's' | 'm' | 'l';

const SIZES: Record<Size, CSSProperties> = {
  s: { padding: '8px 16px', fontSize: '13px' },
  m: { padding: '11px 22px', fontSize: '15px' },
  l: { padding: '14px 28px', fontSize: '16px' },
};

const VARIANTS: Record<Variant, CSSProperties> = {
  primary: { background: 'var(--color-brand)', color: 'var(--text-on-brand)', border: '1px solid transparent' },
  secondary: { background: 'transparent', color: 'var(--color-brand)', border: '1px solid var(--color-brand)' },
  ghost: { background: 'transparent', color: 'var(--text-primary)', border: '1px solid transparent' },
  dark: { background: 'var(--surface-inverse)', color: 'var(--text-on-dark)', border: '1px solid transparent' },
};

interface ButtonProps {
  children: ReactNode;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  icon?: ReactNode;
  onClick?: () => void;
}

/** Santander DS `Button` component, ported from _ds_bundle.js. */
export function Button({ children, variant = 'primary', size = 'm', disabled = false, icon = null, onClick }: ButtonProps) {
  const v = VARIANTS[variant];
  const s = SIZES[size];

  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        fontFamily: 'var(--font-sans)',
        fontWeight: 500,
        borderRadius: 'var(--radius-pill)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        transition: 'background var(--duration-base) var(--ease-standard), opacity var(--duration-base)',
        opacity: disabled ? 0.4 : 1,
        ...v,
        ...s,
      }}
      onMouseEnter={(e: MouseEvent<HTMLButtonElement>) => {
        if (disabled) return;
        if (variant === 'primary') e.currentTarget.style.background = 'var(--color-brand-hover)';
        if (variant === 'secondary' || variant === 'ghost') e.currentTarget.style.background = 'var(--color-brand-soft)';
      }}
      onMouseLeave={(e: MouseEvent<HTMLButtonElement>) => {
        e.currentTarget.style.background = v.background as string;
      }}
    >
      {icon}
      {children}
    </button>
  );
}
