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

/** Proper custom input that forwards ref + props from react-datepicker */
const DateTextInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, disabled, ...props }, ref) => {
    return (
      <div className={clsx('app-date-input', disabled && 'opacity-60')}>
        <input
          ref={ref}
          {...props}
          className={clsx('app-date-input-field', className)}
          inputMode="numeric"
          aria-label="Date"
          disabled={disabled}
        />
        <CalendarIcon className="app-date-icon" />
      </div>
    );
  }
);
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
  clearable = true,
  showToday = true,
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

  const CalendarContainer = (props: any) => {
    return (
      <div className="app-date-container">
        {props.children}
        {(showToday || clearable) && (
          <div className="app-date-footer">
            {showToday && (
              <button
                type="button"
                className="app-date-footer-btn"
                onClick={() => onChange(toLocalStartOfDay(new Date()))}
              >
                Today
              </button>
            )}
            {clearable && (
              <button
                type="button"
                className="app-date-footer-btn app-date-clear"
                onClick={() => onChange(null)}
              >
                Clear
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={clsx('app-date-input-wrap', className)}>
      <DatePicker
        selected={value ?? null}
        onChange={(d) => onChange(d ? toLocalStartOfDay(d as Date) : null)}
        // Parse whatever the user typed when they leave the field or press Enter
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
        calendarContainer={CalendarContainer}
        showPopperArrow={false}
        popperPlacement="bottom-start"
      />
    </div>
  );
}

export default AppDatePicker;
