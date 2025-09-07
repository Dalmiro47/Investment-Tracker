'use client';

import * as React from 'react';
import { parse, format, isValid } from 'date-fns';
import DatePicker from 'react-datepicker';
import enGB from 'date-fns/locale/en-GB';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
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
  inputFormat?: string; // default: dd/MM/yyyy
};

const INPUT_FORMAT_DEFAULT = 'dd/MM/yyyy';
const TWO_DIGIT_YEAR_PIVOT = 50; // 00..49 => 2000..2049, 50..99 => 1950..1999

function toLocalStartOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function expandTwoDigitYear(yy: string): string {
  const n = Number(yy);
  return n <= TWO_DIGIT_YEAR_PIVOT ? `20${yy.padStart(2, '0')}` : `19${yy.padStart(2, '0')}`;
}

// Try multiple formats when user types (supports dd/MM/yy and ddMMyy)
function parseUserInput(v: string, fmt: string): Date | null {
  const raw = v.trim();
  if (!raw) return null;

  // If ddMMyy (6) -> expand to ddMMyyyy; If dd/MM/yy -> expand to dd/MM/yyyy
  if (/^\d{6}$/.test(raw)) {
    const d = raw.slice(0, 2);
    const m = raw.slice(2, 4);
    const y4 = expandTwoDigitYear(raw.slice(4));
    const parsed = parse(`${d}${m}${y4}`, 'ddMMyyyy', new Date());
    if (isValid(parsed)) return toLocalStartOfDay(parsed);
  }
  if (/^\d{2}\/\d{2}\/\d{2}$/.test(raw)) {
    const [d, m, y2] = raw.split('/');
    const y4 = expandTwoDigitYear(y2);
    const parsed = parse(`${d}/${m}/${y4}`, 'dd/MM/yyyy', new Date());
    if (isValid(parsed)) return toLocalStartOfDay(parsed);
  }

  const tryFormats = [
    fmt,                // dd/MM/yyyy
    'dd/MM/yy',         // will accept, but expand above first anyway
    'ddMMyyyy',
    'yyyy-MM-dd',
    'dd.MM.yyyy',
    'MM/dd/yyyy',
    'd/M/yyyy',
    'dd/M/yyyy',
  ];

  for (const f of tryFormats) {
    const parsed = parse(raw, f, new Date());
    if (isValid(parsed)) return toLocalStartOfDay(parsed);
  }
  return null;
}

/** forward ref + clickable icon */
const DateTextInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, disabled, onClick, ...props }, ref) => {
  const innerRef = React.useRef<HTMLInputElement>(null);
  React.useImperativeHandle(ref, () => innerRef.current as HTMLInputElement);

  const openPicker = (e: React.MouseEvent) => {
    if (disabled) return;
    onClick?.(e as any);
    innerRef.current?.focus();
  };

  return (
    <div className={clsx('app-date-input', disabled && 'opacity-60')}>
      <input
        ref={innerRef}
        {...props}
        onClick={onClick}
        className={clsx('app-date-input-field', className)}
        inputMode="numeric"
        aria-label="Date"
        disabled={disabled}
      />
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

  const commitFromInputEl = (el: HTMLInputElement | null) => {
    if (!el) return;
    const raw = el.value;
    const parsed = parseUserInput(raw, inputFormat);

    if (!raw.trim()) return onChange(null);
    if (parsed) {
      if (minDate && parsed < toLocalStartOfDay(minDate)) return onChange(toLocalStartOfDay(minDate));
      if (maxDate && parsed > toLocalStartOfDay(maxDate)) return onChange(toLocalStartOfDay(maxDate));
      return onChange(parsed);
    }
    // invalid -> ignore; DatePicker will keep current value
  };

  return (
    <div className={clsx('app-date-input-wrap', className)}>
      <DatePicker
        selected={value ?? null}
        onChange={(d) => onChange(d ? toLocalStartOfDay(d as Date) : null)}
        /* live mask + keep caret */
        onChangeRaw={(e) => {
          const input = e.target as HTMLInputElement;
          let digits = input.value.replace(/\D/g, '').slice(0, 8); // ddmmyyyy
          let out = '';
          if (digits.length <= 2) out = digits;
          else if (digits.length <= 4) out = `${digits.slice(0, 2)}/${digits.slice(2)}`;
          else out = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
          input.value = out;
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
        portalId="app-datepicker-portal"
        shouldCloseOnSelect
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

        /* --- Custom compact header with arrows where you want them --- */
        renderCustomHeader={({
          date,
          changeMonth,
          changeYear,
          decreaseMonth,
          increaseMonth,
          prevMonthButtonDisabled,
          nextMonthButtonDisabled,
        }) => {
          // Month names in en-GB, independent of date-fns locale types
          const months = Array.from({ length: 12 }, (_, i) =>
            new Date(2020, i, 1).toLocaleString('en-GB', { month: 'long' })
          );
        
          // Build a year range. Prefer min/max; otherwise 1900..(current+50)
          const curYear = new Date().getFullYear();
          const start = (minDate ? minDate.getFullYear() : 1900);
          const end = (maxDate ? maxDate.getFullYear() : curYear + 50);
          const years = Array.from({ length: end - start + 1 }, (_, i) => start + i);
        
          // Ensure the current year is in the list (in case min/max are tight)
          const year = date.getFullYear();
          if (!years.includes(year)) years.push(year);
          years.sort((a, b) => a - b);
        
          return (
            <div className="rdp-header">
              <button
                type="button"
                className="rdp-nav rdp-nav-prev"
                onClick={decreaseMonth}
                aria-label="Previous month"
                disabled={prevMonthButtonDisabled}
              >
                <ChevronLeft size={16} />
              </button>
        
              <select
                className="rdp-sel"
                value={date.getMonth()}
                onChange={(e) => changeMonth(Number(e.target.value))}
              >
                {months.map((name, i) => (
                  <option key={name} value={i}>{name}</option>
                ))}
              </select>
        
              <select
                className="rdp-sel"
                value={date.getFullYear()}
                onChange={(e) => changeYear(Number(e.target.value))}
              >
                {years.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
        
              <button
                type="button"
                className="rdp-nav rdp-nav-next"
                onClick={increaseMonth}
                aria-label="Next month"
                disabled={nextMonthButtonDisabled}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          );
        }}
      />
    </div>
  );
}

export default AppDatePicker;
