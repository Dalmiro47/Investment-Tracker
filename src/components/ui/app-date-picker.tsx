
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

// ... (Helper functions clamp, expand2DigitYear, parseUserInput remain the same)
// Use the same helper functions from your previous file here to save space
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
  
  // Ref to track if we are currently clicking a day
  const isSelectingRef = React.useRef(false);
  
  // 1. Log whenever the component receives a new value prop
  const valueTimestamp = value?.getTime();
  
  React.useEffect(() => {
    // console.log('DEBUG: useEffect triggered', { valueTimestamp, text });
    
    const distinctDate = valueTimestamp ? new Date(valueTimestamp) : null;

    if (distinctDate) {
      const formatted = format(distinctDate, inputFormat);
      // Only update state if different
      if (text !== formatted) {
        console.log('DEBUG: Syncing text from Prop', { old: text, new: formatted });
        setText(formatted);
      }
      
      if (!isSameMonth(distinctDate, view)) {
         setView(distinctDate);
      }
    } else {
       if (text !== '') setText('');
    }
  }, [valueTimestamp, inputFormat]); // Removed 'text' and 'view' from dependencies to be safe

  const onChangeRaw = (e: React.ChangeEvent<HTMLInputElement>) => {
    let digits = e.target.value.replace(/\D/g, '').slice(0, 8);
    let out = '';
    if (digits.length <= 2) out = digits;
    else if (digits.length <= 4) out = `${digits.slice(0, 2)}/${digits.slice(2)}`;
    else out = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
    setText(out);
  };

  const commitText = (source: string) => {
    const parsed = parseUserInput(text, inputFormat);
    
    // Safety: If parsed is same as current value, DO NOT FIRE onChange
    if (parsed && value && isSameDay(parsed, value)) {
        console.log(`DEBUG: commitText (${source}) -> IGNORED (Same Day)`);
        // Just ensure text format is pretty
        const pretty = format(value, inputFormat);
        if (text !== pretty) setText(pretty);
        return;
    }

    console.log(`DEBUG: commitText (${source}) -> FIRING onChange`, parsed);
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
    e.stopPropagation(); // Stop event bubbling

    if (disabled) return;

    // MARKER: We are selecting via click
    isSelectingRef.current = true;
    console.log('DEBUG: selectDay clicked', d);
    
    const picked = startOfDayLocal(d);

    // Update text IMMEDIATELY to prevent stale commits
    setText(format(picked, inputFormat));

    // Fire change
    if (!value || !isSameDay(picked, value)) {
        console.log('DEBUG: selectDay -> firing onChange');
        onChange(picked);
    }
    
    setOpen(false);
    
    // Reset marker after a safe delay
    setTimeout(() => { isSelectingRef.current = false; }, 200);
  };

  return (
    <div className={clsx('w-full', className)}>
      <Popover modal={true} open={open} onOpenChange={(o) => {
        setOpen(o);
        // CRITICAL CHECK: Only commit on CLOSE if we are NOT selecting a day
        if (!o) {
            if (!isSelectingRef.current) {
                console.log('DEBUG: Popover closing -> Committing text');
                commitText('onClose');
            } else {
                console.log('DEBUG: Popover closing -> SKIPPING commit (Selection active)');
            }
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
                  commitText('EnterKey');
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
          // Prevent auto-focus stealing issues
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
             {/* Simplified header for debug */}
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
