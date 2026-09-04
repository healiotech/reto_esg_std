import type { ChangeEvent } from 'react';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  label?: string;
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  id?: string;
}

/** Santander DS `Select` component, ported from _ds_bundle.js (adapted for id/label options). */
export function Select({ label, options, value, onChange, disabled = false, id }: SelectProps) {
  return (
    <label
      htmlFor={id}
      style={{
        fontFamily: 'var(--font-sans)',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        fontSize: 13,
        color: 'var(--text-secondary)',
      }}
    >
      {label && <span>{label}</span>}
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 15,
          padding: '11px 14px',
          borderRadius: 'var(--radius-m)',
          border: '1px solid var(--border-default)',
          background: disabled ? 'var(--neutral-50)' : '#fff',
          color: 'var(--text-primary)',
          outline: 'none',
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
