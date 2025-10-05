import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Item = { label: string; desc: string };
type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  items: Item[];
};

export function ColumnHelpDialog({ open, onOpenChange, title, items }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="
          sm:max-w-2xl w-[95vw] max-w-3xl
          max-h-[70vh] overflow-y-auto
          p-5 sm:p-6
        "
      >
        <DialogHeader className="mb-2">
          <DialogTitle className="text-base sm:text-lg">{title}</DialogTitle>
        </DialogHeader>

        {/* Definition grid */}
        <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-x-6 gap-y-3">
          {items.map((it, i) => (
            <React.Fragment key={i}>
              <div className="text-sm font-medium text-muted-foreground">{it.label}</div>
              <div className="text-sm leading-relaxed">{it.desc}</div>
              {i < items.length - 1 && <div className="sm:col-span-2 border-t border-white/10 my-1.5" />}
            </React.Fragment>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
