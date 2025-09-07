'use client';

import * as React from 'react';
import { Input } from '@/components/ui/input';

export type NumericInputProps = {
  value: number | null | undefined;
  onCommit: (n: number | null) => void;
  placeholder?: string;
  allowDecimal?: boolean;   // default: true
  className?: string;
};

/**
 * A friendly numeric input:
 * - lets users clear the field (no forced 0)
 * - blocks negatives / exponent keys
 * - sanitizes pasted text
 * - clamps to >= 0 on commit (blur/Enter)
 */
export function NumericInput({
  value,
  onCommit,
  placeholder,
  allowDecimal = true,
  className,
}: NumericInputProps) {
  const [s, setS] = React.useState<string>(value != null ? String(value) : '');

  React.useEffect(() => {
    setS(value != null ? String(value) : '');
  }, [value]);

  const sanitize = (raw: string) => {
    let v = raw.replace(',', '.').replace(/[^\d.]/g, '');
    if (!allowDecimal) v = v.replace(/\./g, '');
    const i = v.indexOf('.');
    if (i !== -1) v = v.slice(0, i + 1) + v.slice(i + 1).replace(/\./g, '');
    if (v.startsWith('0') && v.length > 1 && v[1] !== '.') v = v.replace(/^0+/, '');
    return v;
  };

  const commit = () => {
    const t = s.trim();
    if (!t) return onCommit(null);
    const n = Number(t);
    if (Number.isNaN(n)) {
      setS(value != null ? String(value) : '');
      return;
    }
    const clamped = Math.max(0, n);
    setS(String(clamped));
    onCommit(clamped);
  };

  return (
    <Input
      className={className}
      placeholder={placeholder}
      value={s}
      onChange={(e) => setS(sanitize(e.target.value))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault();
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        }
      }}
      inputMode={allowDecimal ? 'decimal' : 'numeric'}
      min={0}
      step={allowDecimal ? 'any' : 1}
    />
  );
}
