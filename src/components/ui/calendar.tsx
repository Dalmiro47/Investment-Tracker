"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker, type DayPickerDefaultProps } from "react-day-picker"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select"
import { ScrollArea } from "./scroll-area"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  const handleCalendarChange = (
    _month: Date,
    e: React.ChangeEvent<HTMLSelectElement>
  ) => {
    const propsToUse = props as DayPickerDefaultProps
    const newMonth = new Date(propsToUse.month ?? new Date())
    if (e.target.name === 'months') {
      newMonth.setMonth(parseInt(e.target.value, 10))
    } else {
      newMonth.setFullYear(parseInt(e.target.value, 10))
    }
    propsToUse.onMonthChange?.(newMonth)
  }
  
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-4",
        caption: "flex justify-center pt-1 relative items-center",
        caption_label: "text-sm font-medium hidden",
        caption_dropdowns: "flex justify-center gap-1",
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
        Caption: ({...props}) => {
          const p = props as DayPickerDefaultProps
          const fromYear = p.fromYear ?? 1950
          const toYear = p.toYear ?? new Date().getFullYear()
          const month = p.month ?? new Date();

          return (
            <div className="flex justify-center gap-1 items-center">
              <Select
                name="months"
                value={month.getMonth().toString()}
                onValueChange={(value) => {
                  handleCalendarChange(month, {
                    target: { value, name: 'months' },
                  } as React.ChangeEvent<HTMLSelectElement>)
                }}
              >
                <SelectTrigger className="w-[60%]">
                  <SelectValue placeholder="Month" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => (
                    <SelectItem key={i} value={i.toString()}>
                      {new Date(month.getFullYear(), i).toLocaleString('default', {
                        month: 'long',
                      })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                name="years"
                value={month.getFullYear().toString()}
                onValueChange={(value) => {
                  handleCalendarChange(month, {
                    target: { value, name: 'years' },
                  } as React.ChangeEvent<HTMLSelectElement>)
                }}
              >
                <SelectTrigger className="w-[40%]">
                  <SelectValue placeholder="Year" />
                </SelectTrigger>
                <SelectContent>
                  <ScrollArea className="h-80">
                    {Array.from({ length: toYear - fromYear + 1 }, (_, i) => (
                      <SelectItem key={i} value={(fromYear + i).toString()}>
                        {fromYear + i}
                      </SelectItem>
                    ))}
                  </ScrollArea>
                </SelectContent>
              </Select>
            </div>
          )
        },
      }}
      {...props}
    />
  )
}
Calendar.displayName = "Calendar"

export { Calendar }
