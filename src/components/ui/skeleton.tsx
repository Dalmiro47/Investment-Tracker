import { cn } from "@/lib/utils"

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-[10px] bg-white/[.06]", className)}
      {...props}
    />
  )
}

export { Skeleton }
