
"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker } from "react-day-picker"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  const [pickerOpen, setPickerOpen] = React.useState(false);
  
  const years = Array.from({ length: 101 }, (_, i) => new Date().getFullYear() - 50 + i);
  const months = Array.from({ length: 12 }, (_, i) => i);


  return (
    <div className="relative">
      <DayPicker
        showOutsideDays={showOutsideDays}
        className={cn("p-3", className)}
        classNames={{
          months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
          month: "space-y-4",
          caption: "flex justify-center pt-1 relative items-center",
          caption_label: "text-sm font-medium",
          nav: "space-x-1 flex items-center",
          nav_button: cn(
            buttonVariants({ variant: "outline" }),
            "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100"
          ),
          nav_button_previous: "absolute left-1",
          nav_button_next: "absolute right-1",
          table: "w-full border-collapse space-y-1",
          head_row: "flex",
          head_cell:
            "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]",
          row: "flex w-full mt-2",
          cell: "h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
          day: cn(
            buttonVariants({ variant: "ghost" }),
            "h-9 w-9 p-0 font-normal aria-selected:opacity-100"
          ),
          day_range_end: "day-range-end",
          day_selected:
            "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
          day_today: "bg-accent text-accent-foreground",
          day_outside:
            "day-outside text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground",
          day_disabled: "text-muted-foreground opacity-50",
          day_range_middle:
            "aria-selected:bg-accent aria-selected:text-accent-foreground",
          day_hidden: "invisible",
          ...classNames,
        }}
        components={{
          IconLeft: ({ ...props }) => <ChevronLeft className="h-4 w-4" />,
          IconRight: ({ ...props }) => <ChevronRight className="h-4 w-4" />,
          Caption: ({ displayMonth }) => {
            
            function handleHeaderClick() {
              setPickerOpen(true);
            }
            
            function pickMonthYear(m: number, y: number) {
              setPickerOpen(false);
              props.onMonthChange?.(new Date(y, m, 1));
            }

            return (
               <div className="flex items-center justify-between w-full">
                  <button
                    type="button"
                    aria-label="Previous month"
                    disabled={!props.onMonthChange}
                    onClick={() => props.onMonthChange?.(new Date(displayMonth.getFullYear(), displayMonth.getMonth() - 1))}
                    className={cn(buttonVariants({ variant: "outline" }), "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100")}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span
                    className="cursor-pointer px-2 py-1 rounded hover:bg-accent transition"
                    onClick={handleHeaderClick}
                  >
                    {displayMonth.toLocaleString("default", { month: "long", year: "numeric" })}
                  </span>
                  <button
                    type="button"
                    aria-label="Next month"
                    disabled={!props.onMonthChange}
                    onClick={() => props.onMonthChange?.(new Date(displayMonth.getFullYear(), displayMonth.getMonth() + 1))}
                    className={cn(buttonVariants({ variant: "outline" }), "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100")}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  {pickerOpen && (
                    <div className="absolute z-50 top-full left-1/2 -translate-x-1/2 bg-popover p-2 rounded shadow-lg border flex gap-4">
                      <div>
                        <div className="font-bold mb-1 text-center">Month</div>
                        <div className="grid grid-cols-3 gap-1">
                          {months.map((m) => (
                            <button
                              key={m}
                              type="button"
                              className="text-sm px-2 py-1 hover:bg-accent rounded"
                              onClick={() => pickMonthYear(m, displayMonth.getFullYear())}
                            >
                              {new Date(0, m).toLocaleString("default", { month: "short" })}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div className="font-bold mb-1 text-center">Year</div>
                        <div className="h-48 overflow-y-auto flex flex-col pr-2">
                          {years.map((y) => (
                            <button
                              key={y}
                              type="button"
                              className={cn("text-sm px-2 py-1 hover:bg-accent rounded text-left", y === displayMonth.getFullYear() && "bg-accent")}
                              onClick={() => pickMonthYear(displayMonth.getMonth(), y)}
                            >
                              {y}
                            </button>
                          ))}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="absolute top-1 right-1 text-muted-foreground hover:text-foreground h-6 w-6"
                        onClick={() => setPickerOpen(false)}
                      >
                        &times;
                      </button>
                    </div>
                  )}
              </div>
            )
          }
        }}
        {...props}
      />
    </div>
  )
}
Calendar.displayName = "Calendar"

export { Calendar }
