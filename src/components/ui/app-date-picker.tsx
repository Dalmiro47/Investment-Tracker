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
  const isMountedRef = React.useRef(false); // New safety check

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
      if (text !== formatted) {
        setText(formatted);
      }
      if (!isSameMonth(distinctDate, view)) {
         setView(distinctDate);
      }
    } else {
       if (text !== '') setText('');
    }
    // FIX: Remove 'view' from dependencies to prevent "snap back" loop when navigating months
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueTimestamp, inputFormat, text]); 

  const onChangeRaw = (e: React.ChangeEvent<HTMLInputElement>) => {
    let digits = e.target.value.replace(/\D/g, '').slice(0, 8);
    let out = '';
    if (digits.length <= 2) out = digits;
    else if (digits.length <= 4) out = `${digits.slice(0, 2)}/${digits.slice(2)}`;
    else out = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
    setText(out);
  };

  const commitText = () => {
    // STOP if unmounted
    if (!isMountedRef.current) return;

    const parsed = parseUserInput(text, inputFormat);
    
    // Safety: If parsed is same as current value, DO NOT FIRE onChange
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

    if (disabled) return;
    if (!isMountedRef.current) return;

    isSelectingRef.current = true;
    
    const picked = startOfDayLocal(d);

    // Update text IMMEDIATELY 
    setText(format(picked, inputFormat));

    if (!value || !isSameDay(picked, value)) {
        onChange(picked);
    }
    
    setOpen(false);
    
    // Reset marker after a safe delay
    setTimeout(() => { 
        if(isMountedRef.current) isSelectingRef.current = false; 
    }, 200);
  };

  return (
    <div className={clsx('w-full', className)}>
      <Popover modal={true} open={open} onOpenChange={(o) => {
        setOpen(o);
        // CRITICAL: Only commit on CLOSE if we are NOT currently selecting a day
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
              className="grid place-items-center h-7 w-7 rounded-md border border-border"
              onClick={() => setView(subMonths(view, 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
             <div className="flex-1 text-center font-medium">
                {format(view, 'MMMM yyyy')}
             </div>
            <button
              type="button"
              className="grid place-items-center h-7 w-7 rounded-md border border-border"
              onClick={() => setView(addMonths(view, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-y-1 p-2">
            {days.map((d) => (
                <button
                  key={+d}
                  type="button"
                  onClick={(e) => selectDay(e, d)}
                  className={clsx(
                    'h-8 w-8 mx-auto rounded-md text-sm grid place-items-center',
                    !!value && isSameDay(d, value) ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary'
                  )}
                >
                  {d.getDate()}
                </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
