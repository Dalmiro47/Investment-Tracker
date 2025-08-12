
"use client";

import Link from 'next/link';
import { CircleDollarSign, LayoutGrid, LogOut, User, Settings } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/hooks/use-auth';

interface DashboardHeaderProps {
  isTaxView: boolean;
  onTaxViewChange: (checked: boolean) => void;
  onTaxSettingsClick: () => void;
}

export default function DashboardHeader({ isTaxView, onTaxViewChange, onTaxSettingsClick }: DashboardHeaderProps) {
  const { user, signOut } = useAuth();
  
  const getInitials = (name: string | null | undefined) => {
    if (!name) return 'U';
    const names = name.split(' ');
    if (names.length > 1) {
      return names[0][0] + names[names.length - 1][0];
    }
    return name.substring(0, 2);
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-card">
      <div className="container flex h-16 items-center space-x-4 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center space-x-2">
          <CircleDollarSign className="h-6 w-6 text-primary" />
          <span className="font-headline text-xl font-bold tracking-tight">DDS Investment Tracker</span>
        </Link>
        <div className="flex flex-1 items-center justify-center space-x-4">
          <div className="flex items-center space-x-2">
            <Label htmlFor="tax-mode" className="font-medium">German Tax Report</Label>
            <Switch
              id="tax-mode"
              checked={isTaxView}
              onCheckedChange={onTaxViewChange}
              aria-label="Toggle tax report view"
            />
          </div>
          {isTaxView && (
            <Button variant="outline" size="sm" onClick={onTaxSettingsClick}>
              <Settings className="mr-2 h-4 w-4" />
              Tax Settings
            </Button>
          )}
        </div>
        <div className="flex items-center space-x-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                <Avatar className="h-9 w-9">
                  <AvatarImage src={user?.photoURL ?? ''} alt="User avatar" data-ai-hint="person" />
                  <AvatarFallback>{getInitials(user?.displayName)}</AvatarFallback>
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
                <DropdownMenuItem>
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
