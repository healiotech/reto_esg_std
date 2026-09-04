import { useState, type ChangeEvent } from 'react';

interface InputProps {
  label?: string;
  placeholder?: string;
  type?: string;
  error?: string;
  disabled?: boolean;
  value: string;
  onChange: (value: string) => void;
  id?: string;
}

/** Santander DS `Input` component, ported from _ds_bundle.js (adapted to be controlled). */
export function Input({ label, placeholder, type = 'text', error, disabled = false, value, onChange, id }: InputProps) {
  const [focused, setFocused] = useState(false);

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
      <input
        id={id}
        type={type}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 15,
          padding: '11px 14px',
          borderRadius: 'var(--radius-m)',
          border: `1px solid ${error ? 'var(--state-danger)' : focused ? 'var(--color-brand)' : 'var(--border-default)'}`,
          outline: 'none',
          boxShadow: focused ? 'var(--shadow-focus)' : 'none',
          background: disabled ? 'var(--neutral-50)' : '#fff',
          color: 'var(--text-primary)',
          transition: 'border var(--duration-fast), box-shadow var(--duration-fast)',
        }}
      />
      {error && <span style={{ color: 'var(--state-danger)', fontSize: 12 }}>{error}</span>}
    </label>
  );
}
