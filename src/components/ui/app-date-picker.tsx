'use client';

import * as React from 'react';
import { parse, format, isValid } from 'date-fns';
import DatePicker from 'react-datepicker';
import enGB from 'date-fns/locale/en-GB';
import { Calendar as CalendarIcon } from 'lucide-react';
import clsx from 'clsx';

import './app-date-picker.css';

export type AppDatePickerProps = {
  value: Date | null | undefined;
  onChange: (date: Date | null) => void;
  placeholder?: string;
  disabled?: boolean;
  minDate?: Date;
  maxDate?: Date;
  className?: string;
  /** Input + display format for typing */
  inputFormat?: string; // default: dd/MM/yyyy
  /** If true, show a clear button in footer */
  clearable?: boolean;  // default: true
  /** If true, show "Today" footer button */
  showToday?: boolean;  // default: true
};

const INPUT_FORMAT_DEFAULT = 'dd/MM/yyyy';

// Ensure we store dates at start-of-day (no TZ surprises)
function toLocalStartOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// Try multiple formats when user types
function parseUserInput(v: string, fmt: string): Date | null {
  const raw = v.trim();
  if (!raw) return null;

  // allow ddMMyyyy (no slashes) in addition to the normal formats
  const tryFormats = [
    fmt,                // e.g. dd/MM/yyyy
    'ddMMyyyy',         // 05082002
    'yyyy-MM-dd',
    'dd.MM.yyyy',
    'MM/dd/yyyy',
    'd/M/yyyy',         // be more forgiving
    'dd/M/yyyy',
  ];

  for (const f of tryFormats) {
    const parsed = parse(raw, f, new Date());
    if (isValid(parsed)) return toLocalStartOfDay(parsed);
  }
  return null;
}

/** Proper custom input that forwards ref + props from react-datepicker
 *  and makes the calendar icon clickable to open the popover.
 */
const DateTextInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, disabled, onClick, ...props }, ref) => {
  const innerRef = React.useRef<HTMLInputElement>(null);

  // expose the inner ref to react-datepicker
  React.useImperativeHandle(ref, () => innerRef.current as HTMLInputElement);

  const openPicker = (e: React.MouseEvent) => {
    if (disabled) return;
    // call the click handler that react-datepicker passes
    onClick?.(e as any);
    // make sure the input gets focus too
    innerRef.current?.focus();
  };

  return (
    <div className={clsx('app-date-input', disabled && 'opacity-60')}>
      <input
        ref={innerRef}
        {...props}
        onClick={onClick}             // keeps normal behavior when user clicks the field
        className={clsx('app-date-input-field', className)}
        inputMode="numeric"
        aria-label="Date"
        disabled={disabled}
      />

      {/* icon acts like a button to open the calendar */}
      <button
        type="button"
        className="app-date-icon-btn"
        onClick={openPicker}
        aria-label="Open calendar"
        disabled={disabled}
      >
        <CalendarIcon className="app-date-icon" />
      </button>
    </div>
  );
});
DateTextInput.displayName = 'DateTextInput';


export function AppDatePicker({
  value,
  onChange,
  placeholder = 'dd/mm/yyyy',
  disabled,
  minDate,
  maxDate,
  className,
  inputFormat = INPUT_FORMAT_DEFAULT,
}: AppDatePickerProps) {

  // commit text the user typed (on blur or Enter)
  const commitFromInputEl = (el: HTMLInputElement | null) => {
    if (!el) return;
    const raw = el.value;
    const parsed = parseUserInput(raw, inputFormat);

    if (!raw.trim()) {
      onChange(null);
      return;
    }
    if (parsed) {
      // clamp to min/max if provided
      if (minDate && parsed < toLocalStartOfDay(minDate)) return onChange(toLocalStartOfDay(minDate));
      if (maxDate && parsed > toLocalStartOfDay(maxDate)) return onChange(toLocalStartOfDay(maxDate));
      onChange(parsed);
    } else {
      // invalid -> snap back to current value
      // letting react-datepicker re-render the previous value
    }
  };

  return (
    <div className={clsx('app-date-input-wrap', className)}>
      <DatePicker
        selected={value ?? null}
        onChange={(d) => onChange(d ? toLocalStartOfDay(d as Date) : null)}
        // ⬇️ Mask: keep digits only, auto-insert slashes, keep caret
        onChangeRaw={(e) => {
            const input = e.target as HTMLInputElement;
            let digits = input.value.replace(/\D/g, '').slice(0, 8); // ddmmyyyy (max 8)

            let out = '';
            if (digits.length <= 2) out = digits;
            else if (digits.length <= 4) out = `${digits.slice(0, 2)}/${digits.slice(2)}`;
            else out = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;

            input.value = out;

            // place caret at the logical position after formatting
            const caret =
            digits.length <= 2 ? digits.length :
            digits.length <= 4 ? digits.length + 1 :
            Math.min(out.length, digits.length + 2);

            requestAnimationFrame(() => input.setSelectionRange(caret, caret));
        }}
        onBlur={(e) => commitFromInputEl(e.target as HTMLInputElement)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commitFromInputEl(e.target as HTMLInputElement);
          }
        }}
        // IMPORTANT: let react-datepicker control the input value and caret.
        customInput={<DateTextInput />}
        dateFormat={inputFormat}
        locale={enGB}
        placeholderText={placeholder}
        showMonthDropdown
        showYearDropdown
        dropdownMode="select"
        calendarStartDay={1}
        disabled={disabled}
        minDate={minDate}
        maxDate={maxDate}
        showPopperArrow={false}
        popperPlacement="bottom-start"
      />
    </div>
  );
}

export default AppDatePicker;
