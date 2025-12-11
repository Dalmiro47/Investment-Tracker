'use client';

import * as React from 'react';
import clsx from 'clsx';
import {
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  format,
  parse,
  isValid,
} from 'date-fns';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

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

const INPUT_FORMAT = 'dd/MM/yyyy';
const PIVOT_2DIGIT = 50; // 00..49 => 2000..2049, 50..99 => 1950..1999

const startOfDayLocal = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

function clamp(date: Date, min?: Date, max?: Date) {
  const d = +startOfDayLocal(date);
  if (min && d < +startOfDayLocal(min)) return startOfDayLocal(min);
  if (max && d > +startOfDayLocal(max)) return startOfDayLocal(max);
  return startOfDayLocal(date);
}

function expand2DigitYear(two: string) {
  const n = Number(two);
  return n <= PIVOT_2DIGIT ? `20${two.padStart(2, '0')}` : `19${two.padStart(2, '0')}`;
}

// dd/MM/yyyy + permissive extras (ddMMyyyy, dd/MM/yy, ddMMyy)
function parseUserInput(raw: string, fmt: string): Date | null {
  const v = raw.trim();
  if (!v) return null;

  if (/^\d{6}$/.test(v)) {
    const d = v.slice(0, 2);
    const m = v.slice(2, 4);
    const y = expand2DigitYear(v.slice(4));
    const parsed = parse(`${d}${m}${y}`, 'ddMMyyyy', new Date());
    return isValid(parsed) ? startOfDayLocal(parsed) : null;
  }
  if (/^\d{2}\/\d{2}\/\d{2}$/.test(v)) {
    const [d, m, y2] = v.split('/');
    const y = expand2DigitYear(y2);
    const parsed = parse(`${d}/${m}/${y}`, 'dd/MM/yyyy', new Date());
    return isValid(parsed) ? startOfDayLocal(parsed) : null;
  }

  for (const f of [fmt, 'ddMMyyyy', 'd/M/yyyy', 'dd/M/yyyy', 'MM/dd/yyyy', 'yyyy-MM-dd', 'dd.MM.yyyy']) {
    const parsed = parse(v, f, new Date());
    if (isValid(parsed)) return startOfDayLocal(parsed);
  }
  return null;
}

export default function AppDatePicker({
  value,
  onChange,
  placeholder = 'dd/mm/yyyy',
  disabled,
  minDate,
  maxDate,
  className,
  inputFormat = INPUT_FORMAT,
}: AppDatePickerProps) {
  const [open, setOpen] = React.useState(false);
  
  // Use a stable reference for the view date to avoid loops
  const [view, setView] = React.useState<Date>(value ?? new Date());
  const [text, setText] = React.useState<string>(value ? format(value, inputFormat) : '');
  
  const isSelectingRef = React.useRef(false);

  // FIX: Track the primitive timestamp to break reference equality loops
  const valueTimestamp = value?.getTime();

  // keep input text and the calendar month in sync with external value
  React.useEffect(() => {
    // 1. Reconstruct date from primitive (avoids new object ref causing infinite loop)
    const distinctDate = valueTimestamp ? new Date(valueTimestamp) : null;

    if (distinctDate) {
      const formatted = format(distinctDate, inputFormat);
      // Only update state if different
      setText((prev) => (prev !== formatted ? formatted : prev));
      
      // Only switch calendar view if month is different
      setView((prev) => (isSameMonth(distinctDate, prev) ? prev : distinctDate));
    } else {
      setText('');
    }
  }, [valueTimestamp, inputFormat]);

  // auto-insert slashes while typing
  const onChangeRaw = (e: React.ChangeEvent<HTMLInputElement>) => {
    let digits = e.target.value.replace(/\D/g, '').slice(0, 8);
    let out = '';
    if (digits.length <= 2) out = digits;
    else if (digits.length <= 4) out = `${digits.slice(0, 2)}/${digits.slice(2)}`;
    else out = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
    setText(out);
  };

  const commitText = () => {
    const parsed = parseUserInput(text, inputFormat);
    
    // FIX: Don't fire onChange if the date hasn't effectively changed
    // This prevents unnecessary Firestore updates and re-renders
    if (parsed && value && isSameDay(parsed, value)) {
        // Just ensure text is formatted nicely and exit
        setText(format(value, inputFormat));
        return;
    }

    if (parsed) onChange(clamp(parsed, minDate, maxDate));
    else if (!text.trim()) onChange(null);
    else setText(value ? format(value, inputFormat) : ''); // snap back to valid
  };

  const days = React.useMemo(() => {
    const start = startOfWeek(startOfMonth(view), { weekStartsOn: 1 }); // Monday
    const end = endOfWeek(endOfMonth(view), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [view]);

  const dayIsDisabled = (d: Date) => {
    if (minDate && +d < +startOfDayLocal(minDate)) return true;
    if (maxDate && +d > +startOfDayLocal(maxDate)) return true;
    return false;
  };

  const selectDay = (e: React.MouseEvent, d: Date) => {
    e.preventDefault();
    e.stopPropagation();

    if (disabled || dayIsDisabled(d)) return;
    
    isSelectingRef.current = true;
    
    const picked = startOfDayLocal(d);
    // FIX: Only trigger change if different
    if (!value || !isSameDay(picked, value)) {
        onChange(picked);
    }
    setOpen(false);

    setTimeout(() => { isSelectingRef.current = false; }, 0);
  };

  const months = Array.from({ length: 12 }, (_, i) =>
    new Date(2020, i, 1).toLocaleString('en-GB', { month: 'long' }),
  );

  const thisYear = new Date().getFullYear();
  const yStart = minDate ? minDate.getFullYear() : 1900;
  const yEnd = maxDate ? maxDate.getFullYear() : thisYear + 50;
  const years = Array.from({ length: yEnd - yStart + 1 }, (_, i) => yStart + i);

  return (
    <div className={clsx('w-full', className)}>
      <Popover modal={true} open={open} onOpenChange={(o) => {
        setOpen(o);
        // FIX: Ensure we don't commit text on simple toggles if we are clicking a day
        if (!o && !isSelectingRef.current) commitText(); 
      }}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className={clsx(
              'w-full grid grid-cols-[1fr_auto] items-center gap-2 rounded-md border px-3 py-2',
              'bg-background border-border text-foreground',
              disabled && 'opacity-60 cursor-not-allowed'
            )}
            onClick={() => setOpen((s) => !s)}
          >
            <input
              aria-label="Date"
              placeholder={placeholder}
              value={text}
              disabled={disabled}
              onChange={onChangeRaw}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitText();
                  setOpen(false);
                }
              }}
              className="bg-transparent outline-none border-0 p-0 m-0 w-full text-sm"
              inputMode="numeric"
            />
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
          </button>
        </PopoverTrigger>

        <PopoverContent
          align="start"
          onCloseAutoFocus={(e) => e.preventDefault()}
          className={clsx(
            'p-0 w-[280px] rounded-md border bg-popover text-popover-foreground shadow-md',
            'border-border'
          )}
        >
          {/* Header */}
          <div className="flex items-center gap-2 p-2 border-b border-border bg-popover">
            <button
              type="button"
              className="grid place-items-center h-7 w-7 rounded-md border border-border text-muted-foreground hover:bg-secondary"
              onClick={() => setView(subMonths(view, 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <select
              className="flex-1 h-7 rounded-md border border-border bg-card px-2 text-sm"
              value={view.getMonth()}
              onChange={(e) => setView(new Date(view.getFullYear(), Number(e.target.value), 1))}
            >
              {months.map((m, i) => (
                <option key={m} value={i}>
                  {m}
                </option>
              ))}
            </select>

            <select
              className="flex-1 h-7 rounded-md border border-border bg-card px-2 text-sm"
              value={view.getFullYear()}
              onChange={(e) => setView(new Date(Number(e.target.value), view.getMonth(), 1))}
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>

            <button
              type="button"
              className="grid place-items-center h-7 w-7 rounded-md border border-border text-muted-foreground hover:bg-secondary"
              onClick={() => setView(addMonths(view, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Week headers */}
          <div className="grid grid-cols-7 text-xs text-muted-foreground px-2 py-1">
            {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => (
              <div key={d} className="text-center py-1">
                {d}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-y-1 p-2">
            {days.map((d) => {
              const outside = !isSameMonth(d, view);
              const selected = !!value && isSameDay(d, value);
              const disabledDay = dayIsDisabled(d);

              return (
                <button
                  key={+d}
                  type="button"
                  disabled={disabledDay}
                  onClick={(e) => selectDay(e, d)}
                  onMouseDown={(e) => e.preventDefault()}
                  className={clsx(
                    'h-8 w-8 mx-auto rounded-md text-sm grid place-items-center',
                    'transition-colors',
                    selected && 'bg-primary text-primary-foreground',
                    !selected && !outside && 'hover:bg-secondary',
                    outside && 'text-muted-foreground opacity-60',
                    disabledDay && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
