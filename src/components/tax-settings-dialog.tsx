
"use client";

import { useState, useEffect } from 'react';
import type { TaxSettings } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

interface TaxSettingsDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  currentSettings: TaxSettings;
  onSave: (settings: TaxSettings) => void;
}

const cryptoRates = [
    { label: '14%', value: 0.14 },
    { label: '20%', value: 0.20 },
    { label: '25%', value: 0.25 },
    { label: '30%', value: 0.30 },
    { label: '35%', value: 0.35 },
    { label: '40%', value: 0.40 },
    { label: '42%', value: 0.42 },
    { label: '45%', value: 0.45 },
];

export function TaxSettingsDialog({ isOpen, onOpenChange, currentSettings, onSave }: TaxSettingsDialogProps) {
  const [settings, setSettings] = useState<TaxSettings>(currentSettings);

  useEffect(() => {
    setSettings(currentSettings);
  }, [currentSettings, isOpen]);

  const handleSave = () => {
    onSave(settings);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>German Tax Settings</DialogTitle>
          <DialogDescription>
            Provide these details to get a better tax estimate. This is not official tax advice.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-6">
          <div className="space-y-2">
            <Label>Filing Status</Label>
            <RadioGroup
              value={settings.filingStatus}
              onValueChange={(value: 'single' | 'married') => setSettings(s => ({ ...s, filingStatus: value }))}
              className="flex gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="single" id="single" />
                <Label htmlFor="single">Single</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="married" id="married" />
                <Label htmlFor="married">Married</Label>
              </div>
            </RadioGroup>
            <p className="text-xs text-muted-foreground">Affects the capital gains allowance (€1,000 for single, €2,000 for married).</p>
          </div>

          <div className="space-y-2">
            <Label>Church Tax Rate</Label>
             <Select
                value={String(settings.churchTaxRate)}
                onValueChange={(value) => setSettings(s => ({ ...s, churchTaxRate: Number(value) as TaxSettings['churchTaxRate'] }))}
             >
                <SelectTrigger>
                    <SelectValue placeholder="Select church tax rate" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="0">0% (None)</SelectItem>
                    <SelectItem value="0.08">8%</SelectItem>
                    <SelectItem value="0.09">9%</SelectItem>
                </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">8% in Bavaria & Baden-Württemberg, 9% elsewhere.</p>
          </div>

           <div className="space-y-2">
            <Label>Crypto Marginal Tax Rate</Label>
             <Select
                value={String(settings.cryptoMarginalRate)}
                onValueChange={(value) => setSettings(s => ({ ...s, cryptoMarginalRate: Number(value) }))}
            >
                <SelectTrigger>
                    <SelectValue placeholder="Select your estimated rate" />
                </SelectTrigger>
                <SelectContent>
                    {cryptoRates.map(rate => (
                        <SelectItem key={rate.value} value={String(rate.value)}>{rate.label}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Your personal income tax rate, applied to crypto gains from private sales held under 1 year.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave}>Save Settings</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
