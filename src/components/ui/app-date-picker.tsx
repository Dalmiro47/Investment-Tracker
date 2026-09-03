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
  isToday,
  format,
  parse,
  isValid,
  startOfDay,
  setHours,
  setMinutes,
} from 'date-fns';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// --- Helper Functions ---
const DATE_FORMAT = 'dd/MM/yyyy';
const TIME_FORMAT = 'HH:mm';
const FULL_FORMAT = 'dd/MM/yyyy HH:mm';

const PIVOT_2DIGIT = 50; 
const startOfDayLocal = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

function expand2DigitYear(two: string) {
  const n = Number(two);
  return n <= PIVOT_2DIGIT ? `20${two.padStart(2, '0')}` : `19${two.padStart(2, '0')}`;
}

function parseUserInput(raw: string, includeTime: boolean): Date | null {
  const v = raw.trim();
  if (!v) return null;

  // Try parsing with time first if enabled
  if (includeTime) {
      const parsedFull = parse(v, FULL_FORMAT, new Date());
      if (isValid(parsedFull)) return parsedFull;
  }

  // Fallbacks for Date only
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
  
  const formats = [DATE_FORMAT, 'ddMMyyyy', 'd/M/yyyy', 'dd/M/yyyy', 'MM/dd/yyyy', 'yyyy-MM-dd', 'dd.MM.yyyy'];
  for (const f of formats) {
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
  includeTime?: boolean; // New Prop
};

export default function AppDatePicker({
  value,
  onChange,
  placeholder,
  disabled,
  minDate,
  maxDate,
  className,
  includeTime = false,
}: AppDatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [view, setView] = React.useState<Date>(value ?? new Date());
  
  const activeFormat = includeTime ? FULL_FORMAT : DATE_FORMAT;
  const [text, setText] = React.useState<string>(value ? format(value, activeFormat) : '');
  const [hoursDraft, setHoursDraft] = React.useState<string>(value ? format(value, 'HH') : '');
  const [minutesDraft, setMinutesDraft] = React.useState<string>(value ? format(value, 'mm') : '');
  
  // Safety Refs
  const isSelectingRef = React.useRef(false);
  const isMountedRef = React.useRef(false); 

  const valueTimestamp = value?.getTime();
  
  React.useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  React.useEffect(() => {
    const distinctDate = valueTimestamp ? new Date(valueTimestamp) : null;

    if (distinctDate) {
      const formatted = format(distinctDate, activeFormat);
      if (text !== formatted) {
        setText(formatted);
      }
      const hh = format(distinctDate, 'HH');
      const mm = format(distinctDate, 'mm');
      if (hoursDraft !== hh) setHoursDraft(hh);
      if (minutesDraft !== mm) setMinutesDraft(mm);
      if (!isSameMonth(distinctDate, view)) {
         setView(distinctDate);
      }
    } else {
       if (text !== '') setText('');
       if (hoursDraft !== '') setHoursDraft('');
       if (minutesDraft !== '') setMinutesDraft('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueTimestamp, activeFormat]); 

  const onChangeRaw = (e: React.ChangeEvent<HTMLInputElement>) => {
    setText(e.target.value);
  };

  const commitText = () => {
    if (!isMountedRef.current) return;

    const parsed = parseUserInput(text, includeTime);
    
    // If we have a value and the parsed value is basically the same (ignoring seconds/ms if we want), don't update
    if (parsed && value && parsed.getTime() === value.getTime()) {
         // just fix format
         const pretty = format(value, activeFormat);
         if (text !== pretty) setText(pretty);
         return;
    }

    if (parsed) {
        // Validation clamping
        let final = parsed;
        if (minDate && final < minDate) final = minDate;
        if (maxDate && final > maxDate) final = maxDate;
        onChange(final);
    }
    else if (!text.trim()) onChange(null);
    else setText(value ? format(value, activeFormat) : ''); 
  };

  const days = React.useMemo(() => {
    const start = startOfWeek(startOfMonth(view), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(view), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [view]);

  const selectDay = (e: React.MouseEvent, d: Date) => {
    e.preventDefault();
    e.stopPropagation();

    // Check bounds
    if (disabled) return;
    if (minDate && startOfDay(d) < startOfDay(minDate)) return;
    if (maxDate && startOfDay(d) > startOfDay(maxDate)) return;
    
    if (!isMountedRef.current) return;

    isSelectingRef.current = true;
    
    // Create new date: The selected Day + The current Time (or 00:00)
    let picked = new Date(
        d.getFullYear(), 
        d.getMonth(), 
        d.getDate(), 
        value ? value.getHours() : 0, 
        value ? value.getMinutes() : 0
    );

    setText(format(picked, activeFormat));
    onChange(picked);
    
    // Only close if we are NOT using time, otherwise user might want to set time next
    if (!includeTime) {
        setOpen(false);
    }
    
    setTimeout(() => { 
        if(isMountedRef.current) isSelectingRef.current = false; 
    }, 200);
  };

  const updateTime = (type: 'hours' | 'minutes', num: number | null) => {
      if (num == null || Number.isNaN(num)) return;
      
      const current = value || new Date(); // Fallback to now if null
      let next = new Date(current);

      if (type === 'hours') {
          num = Math.max(0, Math.min(23, num));
          next = setHours(next, num);
      } else {
          num = Math.max(0, Math.min(59, num));
          next = setMinutes(next, num);
      }
      
      // Clamp logic for time changes
      if (minDate && next < minDate) next = minDate;
      if (maxDate && next > maxDate) next = maxDate;

      onChange(next);
      setText(format(next, activeFormat));
      // keep drafts in sync after commit
      setHoursDraft(format(next, 'HH'));
      setMinutesDraft(format(next, 'mm'));
  };

  const commitTimeField = (type: 'hours' | 'minutes') => {
      const raw = type === 'hours' ? hoursDraft : minutesDraft;
      const trimmed = raw.trim();
      if (!trimmed) return;
      const n = Number(trimmed);
      if (Number.isNaN(n)) return;
      updateTime(type, n);
  };

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
              'grid h-11 w-full grid-cols-[1fr_auto] items-center gap-2 rounded-[10px] border border-input bg-card px-3 text-left md:h-[38px]',
              'ring-offset-background transition-colors focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2',
              open && 'border-primary/60',
              disabled && 'cursor-not-allowed opacity-60'
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
              disabled={disabled}
              className="m-0 w-full border-0 bg-transparent p-0 font-mono text-base font-medium tabular-nums outline-none placeholder:font-body placeholder:font-normal placeholder:text-muted-foreground md:text-[13px]"
              placeholder={placeholder || (includeTime ? "dd/mm/yyyy hh:mm" : "dd/mm/yyyy")}
            />
            <CalendarIcon className={clsx('h-4 w-4 transition-colors', open ? 'text-primary' : 'text-muted-foreground')} />
          </button>
        </PopoverTrigger>

        <PopoverContent
          align="start"
          onCloseAutoFocus={(e) => e.preventDefault()}
          className="glass-strong w-[300px] overflow-hidden rounded-[16px] border-white/10 bg-popover p-0 text-popover-foreground"
        >
          {/* Calendar Header */}
          <div className="flex items-center gap-2 border-b border-white/[.07] px-3 py-2.5">
            <button
              type="button"
              aria-label="Previous month"
              className="grid h-8 w-8 place-items-center rounded-[9px] border border-white/[.07] bg-white/[.03] text-muted-foreground transition-colors hover:bg-white/[.07] hover:text-foreground"
              onClick={() => setView(subMonths(view, 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="flex flex-1 items-baseline justify-center gap-1.5">
              <span className="font-headline text-[14px] font-bold tracking-tight">{format(view, 'MMMM')}</span>
              <span className="font-mono text-[12px] text-muted-foreground">{format(view, 'yyyy')}</span>
            </div>
            <button
              type="button"
              aria-label="Next month"
              className={clsx(
                'grid h-8 w-8 place-items-center rounded-[9px] border border-white/[.07] bg-white/[.03] text-muted-foreground transition-colors',
                canGoNext ? 'hover:bg-white/[.07] hover:text-foreground' : 'cursor-not-allowed opacity-30'
              )}
              onClick={() => canGoNext && setView(addMonths(view, 1))}
              disabled={!canGoNext}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-y-1 px-2 pb-2.5 pt-2">
            {['Mo','Tu','We','Th','Fr','Sa','Su'].map(day => (
                 <div key={day} className="py-1 text-center text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground">{day}</div>
            ))}
            {days.map((d) => {
                const isSelected = !!value && isSameDay(d, value);
                const isCurrentMonth = isSameMonth(d, view);
                const isTodayDay = isToday(d);

                const isBeforeMin = minDate ? startOfDay(d) < startOfDay(minDate) : false;
                const isAfterMax = maxDate ? startOfDay(d) > startOfDay(maxDate) : false;
                const isDisabledDay = isBeforeMin || isAfterMax;

                return (
                <button
                  key={+d}
                  type="button"
                  onClick={(e) => !isDisabledDay && selectDay(e, d)}
                  disabled={isDisabledDay}
                  aria-pressed={isSelected}
                  aria-current={isTodayDay ? 'date' : undefined}
                  className={clsx(
                    'relative mx-auto grid h-9 w-9 place-items-center rounded-[9px] font-mono text-[13px] tabular-nums',
                    'transition-colors',
                    !isCurrentMonth && !isSelected && 'text-muted-foreground/45',
                    isSelected
                        ? 'bg-primary font-bold text-primary-foreground shadow-[0_0_18px_hsl(var(--primary)/.35)]'
                        : isDisabledDay
                            ? 'cursor-not-allowed opacity-25'
                            : 'hover:bg-white/[.07]',
                    isTodayDay && !isSelected && !isDisabledDay && 'font-bold text-primary',
                    isTodayDay && !isSelected && 'after:absolute after:bottom-1 after:left-1/2 after:h-1 after:w-1 after:-translate-x-1/2 after:rounded-full after:bg-primary'
                  )}
                >
                  {d.getDate()}
                </button>
            )})}
          </div>

          {/* TIME SECTION */}
          {includeTime && (
            <div className="border-t border-white/[.07] bg-white/[.02] p-3">
                <div className="mb-2 flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground">Time (HH:mm)</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex-1">
                        <Label className="mb-1 block text-[10px] text-muted-foreground">Hours</Label>
                        <Input
                          type="number"
                          min={0}
                          max={23}
                          step={1}
                          className="h-9 text-center font-mono tabular-nums md:h-9"
                          value={hoursDraft}
                          placeholder={value ? format(value, 'HH') : '00'}
                          onChange={(e) => setHoursDraft(e.target.value)}
                          onBlur={() => commitTimeField('hours')}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              commitTimeField('hours');
                            }
                          }}
                        />
                    </div>
                    <span className="mt-4 font-mono font-bold text-muted-foreground">:</span>
                    <div className="flex-1">
                        <Label className="mb-1 block text-[10px] text-muted-foreground">Mins</Label>
                        <Input
                          type="number"
                          min={0}
                          max={59}
                          step={1}
                          className="h-9 text-center font-mono tabular-nums md:h-9"
                          value={minutesDraft}
                          placeholder={value ? format(value, 'mm') : '00'}
                          onChange={(e) => setMinutesDraft(e.target.value)}
                          onBlur={() => commitTimeField('minutes')}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              commitTimeField('minutes');
                            }
                          }}
                        />
                    </div>
                </div>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
