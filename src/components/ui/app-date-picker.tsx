'use client';

import * as React from 'react';
import { parse, format, isValid } from 'date-fns';
import DatePicker, { registerLocale } from 'react-datepicker';
import enGB from 'date-fns/locale/en-GB';
import { Calendar as CalendarIcon } from 'lucide-react';
import clsx from 'clsx';

import './app-date-picker.css';

registerLocale('en-GB', enGB);

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
  const trimmed = v.trim();
  if (!trimmed) return null;

  const tryFormats = [fmt, 'yyyy-MM-dd', 'dd.MM.yyyy', 'MM/dd/yyyy'];
  for (const f of tryFormats) {
    const parsed = parse(trimmed, f, new Date());
    if (isValid(parsed)) return toLocalStartOfDay(parsed);
  }
  return null;
}

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
  const [text, setText] = React.useState<string>(
    value ? format(value, inputFormat) : ''
  );

  React.useEffect(() => {
    setText(value ? format(value, inputFormat) : '');
  }, [value, inputFormat]);

  // when user types
  const handleChangeRaw = (e: React.ChangeEvent<HTMLInputElement>) => {
    setText(e.target.value);
  };

  const commitTextIfParsable = () => {
    const parsed = parseUserInput(text, inputFormat);
    if (parsed) onChange(parsed);
    else if (!text.trim()) onChange(null);
    else setText(value ? format(value, inputFormat) : '');
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

  const customInput = (
    <div className={clsx('app-date-input', disabled && 'opacity-60')}>
      <input
        value={text}
        onChange={handleChangeRaw}
        placeholder={placeholder}
        disabled={disabled}
        className="app-date-input-field"
        inputMode="numeric"
        aria-label="Date"
      />
      <CalendarIcon className="app-date-icon" />
    </div>
  );

  return (
    <div className={clsx('app-date-input-wrap', className)}>
      <DatePicker
        selected={value ?? null}
        onChange={(d) => onChange(d ? toLocalStartOfDay(d as Date) : null)}
        onChangeRaw={handleChangeRaw}
        onBlur={commitTextIfParsable}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commitTextIfParsable();
          }
        }}
        customInput={customInput}
        dateFormat={inputFormat}
        locale="en-GB"
        // Month & Year dropdowns (like Manage Rates)
        showMonthDropdown
        showYearDropdown
        dropdownMode="select"
        // UX
        calendarStartDay={1} // Monday
        disabled={disabled}
        minDate={minDate}
        maxDate={maxDate}
        // Style container & footer
        calendarContainer={CalendarContainer}
        // Clean popper
        showPopperArrow={false}
        popperPlacement="bottom-start"
      />
    </div>
  );
}

export default AppDatePicker;
