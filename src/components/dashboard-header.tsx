
"use client";

import React from 'react';
import Link from 'next/link';
import { LayoutGrid, LogOut, User, Settings, ReceiptText, PieChart, Wallet } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Section } from '@/components/shell/BottomTabs';
import { useAuth } from '@/hooks/use-auth';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { YearFilter } from '@/lib/types';


interface DashboardHeaderProps {
  /** Which page is shown: the portfolio dashboard or the investments list (mirrors the mobile tabs). */
  section: Section;
  onSectionChange: (section: Section) => void;
  isTaxView: boolean;
  onTaxViewChange: (checked: boolean) => void;
  onTaxSettingsClick: () => void;
  canToggleTaxReport?: boolean;
  toggleDisabledReason?: string;
  sellYears: number[];
  yearFilter: YearFilter;
  onYearFilterChange: (filter: YearFilter) => void;
}

export default function DashboardHeader({
  section,
  onSectionChange,
  isTaxView,
  onTaxViewChange,
  onTaxSettingsClick,
  canToggleTaxReport = false,
  toggleDisabledReason,
  sellYears,
  yearFilter,
  onYearFilterChange,
}: DashboardHeaderProps) {
  const { user, signOut } = useAuth();

  const getInitials = (name: string | null | undefined) => {
    if (!name) return 'U';
    const names = name.split(' ');
    if (names.length > 1) {
      return names[0][0] + names[names.length - 1][0];
    }
    return name.substring(0, 2);
  };

  const toggleDisabled = !canToggleTaxReport;

  const handleYearChange = (value: string) => {
    if (value === 'all') {
      onYearFilterChange({ kind: 'all', mode: yearFilter.mode });
    } else {
      onYearFilterChange({ kind: 'year', year: Number(value), mode: yearFilter.mode });
    }
  };

  return (
    <header className="sticky-bar sticky top-0 z-40 w-full">
      <div className="mx-auto flex h-16 max-w-[1376px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex min-w-0 items-center gap-2.5">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
            <path d="M12 2 22 12 12 22 2 12Z" stroke="hsl(var(--primary))" strokeWidth="1.6" />
            <path d="M12 7 17 12 12 17 7 12Z" fill="hsl(var(--primary))" />
          </svg>
          <span className="truncate font-headline text-[17px] font-bold tracking-tight">DDS Investment</span>
          <span className="ml-1 shrink-0 rounded-[5px] border border-border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
            EUR
          </span>
        </Link>

        {/* Section switch — same two destinations as the mobile bottom tabs */}
        <Tabs
          value={section}
          onValueChange={(v) => onSectionChange(v as Section)}
          className="shrink-0"
        >
          <TabsList aria-label="Section">
            <TabsTrigger value="summary" className="px-4">
              <PieChart size={16} /> Dashboard
            </TabsTrigger>
            <TabsTrigger value="investments" className="px-4">
              <Wallet size={16} /> Investments
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          <Select
            value={yearFilter.kind === 'year' ? String(yearFilter.year) : 'all'}
            onValueChange={handleYearChange}
          >
            <SelectTrigger aria-label="Select tax year" className="h-9 w-[132px] md:h-9">
              <SelectValue placeholder="Select Tax Year" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Years</SelectItem>
              {sellYears.map(year => (
                <SelectItem key={year} value={String(year)}>{year}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    'flex h-9 items-center gap-2.5 rounded-full border px-3 transition-colors',
                    isTaxView
                      ? 'border-primary/45 bg-primary/[.12] text-primary shadow-[0_0_18px_hsl(var(--primary)/.12)]'
                      : 'border-input text-muted-foreground',
                    toggleDisabled && 'opacity-60',
                  )}
                >
                  <ReceiptText size={18} aria-hidden />
                  <Label
                    htmlFor="tax-mode"
                    className={cn('cursor-pointer whitespace-nowrap text-[13px] font-semibold', toggleDisabled && 'cursor-default')}
                  >
                    German Tax Report
                  </Label>
                  <Switch
                    id="tax-mode"
                    checked={isTaxView}
                    onCheckedChange={onTaxViewChange}
                    disabled={toggleDisabled}
                    aria-disabled={toggleDisabled}
                  />
                </div>
              </TooltipTrigger>
              {toggleDisabled && (
                <TooltipContent>
                  {toggleDisabledReason ?? 'Select a year and switch to Cards view.'}
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>

          <Button variant="ghost" size="sm" className="h-9" onClick={onTaxSettingsClick}>
            <Settings size={18} />
            Tax settings
          </Button>

          {/* a11y announcement for screen readers */}
          <span id="tax-report-disabled" className="sr-only">
            German Tax Report controls may be disabled. Select a year and use Cards view to enable.
          </span>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative ml-1 h-9 w-9 rounded-full p-0">
                <Avatar className="h-[34px] w-[34px] border border-input">
                  <AvatarImage src={user?.photoURL ?? ''} alt="User avatar" data-ai-hint="person" />
                  <AvatarFallback className="bg-secondary text-[12px] font-bold text-muted-foreground">
                    {getInitials(user?.displayName)}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">{user?.displayName}</p>
                  <p className="text-xs leading-none text-muted-foreground">
                    {user?.email}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem>
                  <User className="mr-2 h-4 w-4" />
                  <span>Profile</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onSectionChange('summary')}>
                  <LayoutGrid className="mr-2 h-4 w-4" />
                  <span>Dashboard</span>
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut}>
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Log out</span>
                </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
