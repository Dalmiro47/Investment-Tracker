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
} from 'date-fns';
import { Calendar as CalendarIcon, Check, ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

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
  // Date+time mode: the day tapped in the grid is held here (together with the
  // hour/minute drafts) until the user presses Save — nothing is committed to the
  // parent form while the popover is open.
  const [draftDay, setDraftDay] = React.useState<Date | null>(null);

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
    setDraftDay(null);

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

    // Date+time mode: just remember the day; hours/minutes + Save commit it.
    if (includeTime) {
        setDraftDay(startOfDayLocal(d));
        return;
    }

    isSelectingRef.current = true;

    // Date-only mode: selected day + the value's existing time (or 00:00)
    const picked = new Date(
        d.getFullYear(),
        d.getMonth(),
        d.getDate(),
        value ? value.getHours() : 0,
        value ? value.getMinutes() : 0
    );

    setText(format(picked, activeFormat));
    onChange(picked);
    setOpen(false);

    setTimeout(() => {
        if(isMountedRef.current) isSelectingRef.current = false;
    }, 200);
  };

  const parseTimePart = (raw: string, fallback: number, max: number) => {
      const trimmed = raw.trim();
      if (!trimmed) return fallback;
      const n = Number(trimmed);
      if (!Number.isInteger(n)) return fallback;
      return Math.max(0, Math.min(max, n));
  };

  /** The date the Save button would commit: draft day (or current value / today) + drafted time. */
  const buildDraftDate = React.useCallback((): Date => {
      const day = draftDay ?? value ?? new Date();
      const hh = parseTimePart(hoursDraft, value ? value.getHours() : 0, 23);
      const mm = parseTimePart(minutesDraft, value ? value.getMinutes() : 0, 59);
      let next = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hh, mm);
      if (minDate && next < minDate) next = minDate;
      if (maxDate && next > maxDate) next = maxDate;
      return next;
  }, [draftDay, value, hoursDraft, minutesDraft, minDate, maxDate]);

  const draftDirty =
      draftDay !== null ||
      hoursDraft !== (value ? format(value, 'HH') : '') ||
      minutesDraft !== (value ? format(value, 'mm') : '');

  /** Commit day + time from the popover drafts (Save button / Enter / closing with pending edits). */
  const commitDraft = () => {
      if (!isMountedRef.current) return;
      const next = buildDraftDate();
      setText(format(next, activeFormat));
      setHoursDraft(format(next, 'HH'));
      setMinutesDraft(format(next, 'mm'));
      setDraftDay(null);
      if (!value || next.getTime() !== value.getTime()) {
          onChange(next);
      }
  };

  const handleSave = () => {
      commitDraft();
      setOpen(false);
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
        if (o) {
            setDraftDay(null);
            return;
        }
        if (isSelectingRef.current || !isMountedRef.current) return;
        // Closed by tapping outside / Escape: keep whatever the user already
        // picked in the popover instead of silently dropping it.
        if (includeTime && draftDirty) {
            commitDraft();
        } else {
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
          collisionPadding={8}
          onCloseAutoFocus={(e) => e.preventDefault()}
          // Cap to the space Radix reports so the calendar + time + Save footer
          // scroll inside the popover instead of sliding under the top bar or the
          // on-screen keyboard on small phones.
          className="glass-strong w-[300px] max-h-[var(--radix-popover-available-height)] overflow-x-hidden overflow-y-auto rounded-[16px] border-white/10 bg-popover p-0 text-popover-foreground"
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
                const selectedDay = draftDay ?? value;
                const isSelected = !!selectedDay && isSameDay(d, selectedDay);
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
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleSave();
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
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleSave();
                            }
                          }}
                        />
                    </div>
                </div>

                {/* Footer: what will be committed + explicit Save */}
                <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/[.07] pt-3">
                    <div className="min-w-0">
                        <div className="text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground">Selected</div>
                        <div className="truncate font-mono text-[13px] font-semibold tabular-nums">
                            {format(buildDraftDate(), FULL_FORMAT)}
                        </div>
                    </div>
                    <Button type="button" size="sm" className="h-10 shrink-0 px-4" onClick={handleSave}>
                        <Check size={16} />
                        Save
                    </Button>
                </div>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
