
'use client';

import { Button } from '@/components/ui/button';
import { Briefcase } from 'lucide-react';
import { useRouter } from 'next/navigation';

type Props = {
  variant?: React.ComponentProps<typeof Button>['variant'];
  size?: React.ComponentProps<typeof Button>['size'];
  className?: string;
};

export default function EtfPlansButton({ variant = 'default', size = 'default', className }: Props) {
  const router = useRouter();
  return (
    <Button variant={variant} size={size} className={className} onClick={() => router.push('/etf')}>
      <Briefcase className="mr-2 h-4 w-4" />
      ETF Plans
    </Button>
  );
}
