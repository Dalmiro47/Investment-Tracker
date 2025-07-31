"use client";

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { GoogleIcon } from '@/components/icons';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';

export default function LoginPage() {
  const { signInWithGoogle, user, loading } = useAuth();

  if (loading) {
    return (
       <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 animate-pulse">
                <ShieldCheck className="h-8 w-8 text-primary" />
            </div>
            <p className="text-muted-foreground">Loading...</p>
        </div>
    )
  }
  
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <ShieldCheck className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="font-headline text-3xl">DDS Investment Tracker</CardTitle>
          <CardDescription>Secure sign-in for your portfolio</CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="w-full" size="lg" onClick={signInWithGoogle}>
            <GoogleIcon className="mr-2 h-5 w-5" />
            Sign in with Google
          </Button>
        </CardContent>
        <CardFooter>
          <p className="text-center text-xs text-muted-foreground">
            Your data is protected according to German data protection standards.
            We ensure the privacy and security of your financial information.
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
