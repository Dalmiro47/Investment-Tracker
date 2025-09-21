"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  onAuthStateChanged,
  signInWithRedirect,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  getRedirectResult,
  setPersistence,
  browserLocalPersistence,
  type User,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { ShieldCheck } from "lucide-react";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Tracks whether we've synced the server session cookie for this client user
  const [sessionReady, setSessionReady] = useState(false);
  const sessionSyncing = useRef(false);

  const router = useRouter();
  const pathname = usePathname();

  // 1) Initialize auth persistence + finalize redirect sign-in
  useEffect(() => {
    // Ensure the session survives reloads
    setPersistence(auth, browserLocalPersistence).catch(() => {});

    // Process the Google redirect result if present (safe no-op otherwise)
    getRedirectResult(auth).catch(() => {});

    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setUser(fbUser);
      setLoading(false);
      // reset session flag; will resync for the new user below
      setSessionReady(false);
      sessionSyncing.current = false;
    });

    return () => unsubscribe();
  }, []);

  // 2) When we have a client user, create/refresh the server session cookie once
  useEffect(() => {
    if (loading) return;
    if (!user) {
      // ensure session flags clear when logged out
      setSessionReady(false);
      sessionSyncing.current = false;
      return;
    }
    if (sessionSyncing.current || sessionReady) return;

    sessionSyncing.current = true;
    (async () => {
      try {
        const token = await user.getIdToken(/* forceRefresh */ true);
        const res = await fetch("/api/auth/session", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`Session sync failed: ${res.status}`);
        setSessionReady(true);
      } catch (e) {
        console.error(e);
        // allow retry if it fails
        sessionSyncing.current = false;
      }
    })();
  }, [user, loading, sessionReady]);

  // 3) Routing guard (wait until sessionReady before leaving /login)
  useEffect(() => {
    if (loading) return;

    const isAuthPage = pathname === "/login";

    if (!user && !isAuthPage) {
      router.push("/login");
      return;
    }

    if (user && isAuthPage && sessionReady) {
      router.push("/");
    }
  }, [user, loading, sessionReady, router, pathname]);

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithRedirect(auth, provider);
    } catch (error) {
      console.error("Error signing in with Google", error);
    }
  };

  const signOut = async () => {
    try {
      // clear server cookie first
      await fetch("/api/auth/session", { method: "DELETE" }).catch(() => {});
      await firebaseSignOut(auth);
      setSessionReady(false);
      sessionSyncing.current = false;
      router.push("/login");
    } catch (error) {
      console.error("Error signing out", error);
    }
  };

  // Initial blocking splash
  if (loading || (!user && pathname !== "/login")) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 animate-pulse">
          <ShieldCheck className="h-8 w-8 text-primary" />
        </div>
        <p className="text-muted-foreground">Loading user session...</p>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, loading, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
