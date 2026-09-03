"use client";

import { Button } from '@/components/ui/button';
import { GoogleIcon } from '@/components/icons';
import { useAuth } from '@/hooks/use-auth';

function LogoMark({ size = 64 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className="drop-shadow-[0_0_28px_hsl(var(--primary)/.35)]"
    >
      <path d="M12 2 22 12 12 22 2 12Z" stroke="hsl(var(--primary))" strokeWidth="1.2" />
      <path d="M12 7 17 12 12 17 7 12Z" fill="hsl(var(--primary))" />
    </svg>
  );
}

export default function LoginPage() {
  const { signInWithGoogle, loading } = useAuth();

  if (loading) {
    return (
      <div className="relative z-[1] flex min-h-[100svh] flex-col items-center justify-center gap-4 p-4">
        <div className="animate-pulse">
          <LogoMark />
        </div>
        <p className="eyebrow">Loading</p>
      </div>
    );
  }

  return (
    <div className="relative z-[1] flex min-h-[100svh] flex-col items-center justify-center p-4">
      <div className="glass-strong animate-enter w-full max-w-md overflow-hidden p-7 text-center sm:p-9">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-[radial-gradient(circle,hsl(var(--primary)/.18),transparent_62%)]"
        />
        <div className="relative flex flex-col items-center gap-5">
          <LogoMark />
          <div className="space-y-1.5">
            <h1 className="font-headline text-[28px] font-bold leading-tight tracking-tight">
              DDS Investment
            </h1>
            <p className="text-[13px] text-muted-foreground">
              Secure sign-in for your portfolio
            </p>
          </div>

          <Button className="w-full" size="lg" onClick={signInWithGoogle}>
            <GoogleIcon className="h-5 w-5" />
            Sign in with Google
          </Button>

          <p className="max-w-sm text-[12px] leading-relaxed text-muted-foreground">
            Your data is protected according to German data protection standards.
            We ensure the privacy and security of your financial information.
          </p>
        </div>
      </div>
    </div>
  );
}
