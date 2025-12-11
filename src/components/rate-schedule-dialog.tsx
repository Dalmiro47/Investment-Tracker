"use client";
import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import type { Investment } from "@/lib/types";
import type { SavingsRateChange } from "@/lib/types-savings";
import { addRateChange } from "@/lib/firestore";
import AppDatePicker from "./ui/app-date-picker";

type Props = {
  isOpen: boolean;
  onOpenChange: (v: boolean) => void;
  investment: Investment;
  rates?: SavingsRateChange[];
  onChanged: () => void; // call fetchAllData afterwards
};

export default function RateScheduleDialog({
  isOpen,
  onOpenChange,
  investment,
  rates = [],
  onChanged,
}: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [from, setFrom] = React.useState<Date | null>(new Date());
  const [ratePct, setRatePct] = React.useState<string>("");

  const handleAdd = async () => {
    if (!user) return;
    const val = parseFloat(ratePct);
    if (!from || Number.isNaN(val)) {
      toast({ title: "Enter a date & rate", variant: "destructive" });
      return;
    }
    await addRateChange(user.uid, investment.id, { from: from.toISOString().slice(0, 10), annualRatePct: val });
    toast({ title: "Rate added", description: `${val.toFixed(2)}% from ${from.toISOString().slice(0, 10)}` });
    setRatePct("");
    onChanged();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent 
        className="sm:max-w-[520px]"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Manage Rates — {investment.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border p-3">
            <div className="text-sm font-medium mb-2">Existing rate changes</div>
            <div className="space-y-1 max-h-52 overflow-auto pr-1">
              {rates.length === 0 ? (
                <div className="text-sm text-muted-foreground">No entries yet.</div>
              ) : (
                rates
                  .slice()
                  .sort((a,b)=>a.from.localeCompare(b.from))
                  .map((r, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{r.from}</span>
                      <span className="font-mono">{r.annualRatePct.toFixed(2)}%</span>
                    </div>
                  ))
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <div>
              <Label>Effective date</Label>
              <AppDatePicker
                value={from}
                onChange={setFrom}
              />
            </div>
            <div>
              <Label>Annual rate (%)</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="e.g. 3.25"
                value={ratePct}
                onChange={e=>setRatePct(e.target.value)}
              />
            </div>
            <Button className="md:ml-2" onClick={handleAdd}>Add rate</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
