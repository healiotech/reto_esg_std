interface SwitchProps {
  label?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

/** Santander DS `Switch` component, ported from _ds_bundle.js (adapted to be controlled). */
export function Switch({ label, checked, onChange, disabled = false }: SwitchProps) {
  return (
    <label
      role="switch"
      aria-checked={checked}
      aria-disabled={disabled || undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        fontFamily: 'var(--font-sans)',
        fontSize: 14,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
      }}
      onClick={() => {
        if (!disabled) onChange(!checked);
      }}
    >
      <span
        style={{
          width: 40,
          height: 22,
          borderRadius: 'var(--radius-pill)',
          background: checked ? 'var(--color-brand)' : 'var(--neutral-300)',
          position: 'relative',
          transition: 'background var(--duration-base) var(--ease-standard)',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 2,
            left: 2,
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: '#fff',
            transform: `translateX(${checked ? 18 : 0}px)`,
            transition: 'transform var(--duration-base) var(--ease-standard)',
            boxShadow: '0 1px 2px rgba(0,0,0,.3)',
          }}
        />
      </span>
      {label}
    </label>
  );
}
