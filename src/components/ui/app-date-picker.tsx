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
  isAfter,
  startOfDay,
} from 'date-fns';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

// --- Helper Functions ---
const INPUT_FORMAT = 'dd/MM/yyyy';
const PIVOT_2DIGIT = 50; 
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

function parseUserInput(raw: string, fmt: string): Date | null {
  const v = raw.trim();
  if (!v) return null;
  if (/^\d{6}$/.test(v)) {
    const d = v.slice(0, 2); const m = v.slice(2, 4); const y = expand2DigitYear(v.slice(4));
    const parsed = parse(`${d}${m}${y}`, 'ddMMyyyy', new Date());
    return isValid(parsed) ? startOfDayLocal(parsed) : null;
  }
  if (/^\d{2}\/\d{2}\/\d{2}$/.test(v)) {
    const [d, m, y2] = v.split('/'); const y = expand2DigitYear(y2);
    const parsed = parse(`${d}/${m}/${y}`, 'dd/MM/yyyy', new Date());
    return isValid(parsed) ? startOfDayLocal(parsed) : null;
  }
  for (const f of [fmt, 'ddMMyyyy', 'd/M/yyyy', 'dd/M/yyyy', 'MM/dd/yyyy', 'yyyy-MM-dd', 'dd.MM.yyyy']) {
    const parsed = parse(v, f, new Date());
    if (isValid(parsed)) return startOfDayLocal(parsed);
  }
  return null;
}

export type AppDatePickerProps = {
  value: Date | null | undefined;
  onChange: (date: Date | null) => void;
  placeholder?: string;
  disabled?: boolean;
  minDate?: Date;
  maxDate?: Date;
  className?: string;
  inputFormat?: string;
};

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
  const [view, setView] = React.useState<Date>(value ?? new Date());
  const [text, setText] = React.useState<string>(value ? format(value, inputFormat) : '');
  
  // Safety Refs
  const isSelectingRef = React.useRef(false);
  const isMountedRef = React.useRef(false); 

  const valueTimestamp = value?.getTime();
  
  // 1. Track Mount State
  React.useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // 2. Sync with External Prop
  React.useEffect(() => {
    const distinctDate = valueTimestamp ? new Date(valueTimestamp) : null;

    if (distinctDate) {
      const formatted = format(distinctDate, inputFormat);
      // Only update if visually different to avoid cursor jumps, but ALWAYS allow if coming from prop
      if (text !== formatted) {
        setText(formatted);
      }
      if (!isSameMonth(distinctDate, view)) {
         setView(distinctDate);
      }
    } else {
       if (text !== '') setText('');
    }
    // FIX: Removed 'text' from dependencies to stop the infinite loop / frozen screen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueTimestamp, inputFormat]); 

  const onChangeRaw = (e: React.ChangeEvent<HTMLInputElement>) => {
    let digits = e.target.value.replace(/\D/g, '').slice(0, 8);
    let out = '';
    if (digits.length <= 2) out = digits;
    else if (digits.length <= 4) out = `${digits.slice(0, 2)}/${digits.slice(2)}`;
    else out = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
    setText(out);
  };

  const commitText = () => {
    if (!isMountedRef.current) return;

    const parsed = parseUserInput(text, inputFormat);
    
    if (parsed && value && isSameDay(parsed, value)) {
        const pretty = format(value, inputFormat);
        if (text !== pretty) setText(pretty);
        return;
    }

    if (parsed) onChange(clamp(parsed, minDate, maxDate));
    else if (!text.trim()) onChange(null);
    else setText(value ? format(value, inputFormat) : ''); 
  };

  const days = React.useMemo(() => {
    const start = startOfWeek(startOfMonth(view), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(view), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [view]);

  const selectDay = (e: React.MouseEvent, d: Date) => {
    e.preventDefault();
    e.stopPropagation();

    // Check bounds before selecting
    if (disabled) return;
    if (minDate && startOfDay(d) < startOfDay(minDate)) return;
    if (maxDate && startOfDay(d) > startOfDay(maxDate)) return;
    
    if (!isMountedRef.current) return;

    isSelectingRef.current = true;
    
    const picked = startOfDayLocal(d);

    setText(format(picked, inputFormat));

    if (!value || !isSameDay(picked, value)) {
        onChange(picked);
    }
    
    setOpen(false);
    
    setTimeout(() => { 
        if(isMountedRef.current) isSelectingRef.current = false; 
    }, 200);
  };

  // Logic to disable "Next Month" button if we are already at the maxDate's month
  const canGoNext = React.useMemo(() => {
    if (!maxDate) return true;
    const nextMonth = addMonths(view, 1);
    return startOfMonth(nextMonth) <= startOfMonth(maxDate);
  }, [view, maxDate]);

  return (
    <div className={clsx('w-full', className)}>
      <Popover modal={true} open={open} onOpenChange={(o) => {
        setOpen(o);
        if (!o && !isSelectingRef.current && isMountedRef.current) {
            commitText();
        }
      }}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={clsx(
              'w-full grid grid-cols-[1fr_auto] items-center gap-2 rounded-md border px-3 py-2',
              'bg-background border-border text-foreground',
              disabled && 'opacity-60 cursor-not-allowed'
            )}
            onClick={() => setOpen((s) => !s)}
          >
            <input
              value={text}
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
          className="p-0 w-[280px] rounded-md border bg-popover text-popover-foreground shadow-md"
        >
          <div className="flex items-center gap-2 p-2 border-b border-border bg-popover">
            <button
              type="button"
              className="grid place-items-center h-7 w-7 rounded-md border border-border hover:bg-muted"
              onClick={() => setView(subMonths(view, 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
             <div className="flex-1 text-center font-medium">
                {format(view, 'MMMM yyyy')}
             </div>
            <button
              type="button"
              className={clsx(
                "grid place-items-center h-7 w-7 rounded-md border border-border",
                canGoNext ? "hover:bg-muted" : "opacity-30 cursor-not-allowed"
              )}
              onClick={() => canGoNext && setView(addMonths(view, 1))}
              disabled={!canGoNext}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-y-1 p-2">
            {['Mo','Tu','We','Th','Fr','Sa','Su'].map(day => (
                 <div key={day} className="text-center text-xs text-muted-foreground font-medium py-1">{day}</div>
            ))}
            {days.map((d) => {
                const isSelected = !!value && isSameDay(d, value);
                const isCurrentMonth = isSameMonth(d, view);
                // Check disabling
                const isBeforeMin = minDate ? startOfDay(d) < startOfDay(minDate) : false;
                const isAfterMax = maxDate ? startOfDay(d) > startOfDay(maxDate) : false;
                const isDisabledDay = isBeforeMin || isAfterMax;

                return (
                <button
                  key={+d}
                  type="button"
                  onClick={(e) => !isDisabledDay && selectDay(e, d)}
                  disabled={isDisabledDay}
                  className={clsx(
                    'h-8 w-8 mx-auto rounded-md text-sm grid place-items-center',
                    'transition-colors',
                    !isCurrentMonth && 'opacity-40 text-muted-foreground',
                    isSelected 
                        ? 'bg-primary text-primary-foreground' 
                        : isDisabledDay 
                            ? 'opacity-20 cursor-not-allowed' 
                            : 'hover:bg-secondary'
                  )}
                >
                  {d.getDate()}
                </button>
            )})}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
