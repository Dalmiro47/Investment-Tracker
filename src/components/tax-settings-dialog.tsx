"use client";

import { useState, useEffect } from 'react';
import type { TaxSettings } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Info, ArrowLeft } from 'lucide-react';

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
  const [view, setView] = useState<'settings' | 'info'>('settings');

  useEffect(() => {
    setSettings(currentSettings);
    if (isOpen) setView('settings');
  }, [currentSettings, isOpen]);

  const handleSave = () => {
    onSave(settings);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent 
        className={view === 'info' 
            ? "w-[96vw] max-w-3xl p-0 gap-0" // Info View: Wide, no padding on container (we add it inside)
            : "sm:max-w-[500px] p-0 gap-0"   // Settings View: Standard width
        }
      >
        
        {/* VIEW 1: SETTINGS */}
        {view === 'settings' && (
          <div className="p-6">
            <DialogHeader>
              <DialogTitle>German Tax Settings</DialogTitle>
              <DialogDescription>
                Provide these details to get a better tax estimate. This is not official tax advice.
              </DialogDescription>
            </DialogHeader>
            <div className="py-6 space-y-6">
              <div className="space-y-3">
                <Label>Filing Status</Label>
                <RadioGroup
                  value={settings.filingStatus}
                  onValueChange={(value: 'single' | 'married') => setSettings(s => ({ ...s, filingStatus: value }))}
                  className="flex gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="single" id="single" />
                    <Label htmlFor="single" className="font-normal">Single</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="married" id="married" />
                    <Label htmlFor="married" className="font-normal">Married</Label>
                  </div>
                </RadioGroup>
                <p className="text-[0.8rem] text-muted-foreground">Affects the capital gains allowance (€1,000 for single, €2,000 for married).</p>
              </div>

              <div className="space-y-3">
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
                <p className="text-[0.8rem] text-muted-foreground">8% in Bavaria & Baden-Württemberg, 9% elsewhere.</p>
              </div>

               <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Label>Crypto Marginal Tax Rate</Label>
                  <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-5 w-5 -mt-0.5" 
                      onClick={() => setView('info')}
                  >
                      <Info className="h-4 w-4" />
                  </Button>
                </div>
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
                <p className="text-[0.8rem] text-muted-foreground">Your personal income tax rate, applied to crypto gains from private sales held under 1 year.</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={handleSave}>Save Settings</Button>
            </DialogFooter>
          </div>
        )}

        {/* VIEW 2: INFO EXPLANATION */}
        {view === 'info' && (
           <>
            <DialogHeader className="px-6 pt-6 pb-2">
               <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" onClick={() => setView('settings')} className="-ml-2 h-8 w-8">
                      <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <DialogTitle>How to Estimate Your Marginal Tax Rate</DialogTitle>
               </div>
            </DialogHeader>
            <div className="px-6 pb-6 max-h-[65vh] overflow-y-auto">
                <div className="space-y-6 text-sm leading-relaxed">
                  <section className="space-y-2">
                    <h4 className="font-semibold text-foreground">Step 1 — Know your taxable income</h4>
                    <p className="text-muted-foreground">This is not your gross salary. It’s your gross annual income minus:</p>
                    <ul className="list-disc pl-5 text-muted-foreground space-y-1">
                        <li>Social security contributions (health, pension, unemployment, care insurance)</li>
                        <li>Certain deductions (e.g. work expenses lump sum €1,230, special expenses lump sum €36)</li>
                        <li>Allowances (e.g. basic tax-free allowance €11,604 in 2024 for singles)</li>
                    </ul>
                    <p className="text-muted-foreground mt-2 bg-muted/50 p-2 rounded">💡 Your payroll slip or your last <code className="text-xs">Einkommensteuerbescheid</code> shows this number as <code className="text-xs">&quot;zu versteuerndes Einkommen&quot;</code>.</p>
                  </section>
                  
                  <section className="space-y-2">
                    <h4 className="font-semibold text-foreground">Step 2 — Find your marginal rate</h4>
                    <p className="text-muted-foreground">Germany’s income tax is progressive. Here are 2024 figures for single taxpayers (before solidarity surcharge):</p>
                    <div className="border rounded-md overflow-hidden">
                      <table className="w-full text-left text-sm">
                          <thead className="bg-muted">
                              <tr>
                                  <th className="p-2 font-medium">Taxable income (€)</th>
                                  <th className="p-2 font-medium">Marginal tax rate</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y">
                              <tr><td className="p-2">Up to €11,604</td><td className="p-2">0% (tax-free)</td></tr>
                              <tr><td className="p-2">€11,605 – €18,336</td><td className="p-2">14% → 24%</td></tr>
                              <tr><td className="p-2">€18,337 – €66,760</td><td className="p-2">24% → 42%</td></tr>
                              <tr><td className="p-2">€66,761 – €277,825</td><td className="p-2">42%</td></tr>
                              <tr><td className="p-2">Over €277,825</td><td className="p-2">45%</td></tr>
                          </tbody>
                      </table>
                    </div>
                  </section>
                </div>
            </div>
            <div className="p-4 border-t bg-background flex justify-end">
                <Button onClick={() => setView('settings')}>Back to Settings</Button>
            </div>
           </>
        )}
      </DialogContent>
    </Dialog>
  );
}
