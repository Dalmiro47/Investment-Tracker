import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex h-[22px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border px-2 text-[11px] font-bold uppercase leading-none tracking-[.04em] transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 [&_svg]:size-3.5 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground hover:bg-primary/90",
        secondary:
          "border-transparent bg-white/[.06] text-muted-foreground",
        destructive:
          "border-destructive/25 bg-destructive/[.12] text-destructive",
        success:
          "border-success/25 bg-success/[.12] text-success",
        warning:
          "border-warning/25 bg-warning/[.14] text-warning",
        info:
          "border-info/25 bg-info/[.12] text-info",
        outline: "border-input text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
