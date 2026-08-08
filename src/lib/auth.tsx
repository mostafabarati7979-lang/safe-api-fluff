import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "candidate";

export interface Profile {
  id: string;
  full_name: string;
  email: string | null;
  mobile: string | null;
  status: "active" | "inactive";
  avatar_url: string | null;
  created_at: string;
}

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  role: AppRole | null;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (userId: string | undefined) => {
    if (!userId) {
      setProfile(null);
      setRole(null);
      return;
    }

    const [profileResult, roleResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, email, mobile, status, avatar_url, created_at")
        .eq("id", userId)
        .maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
    ]);

    if (profileResult.error) {
      console.error("[Auth] Profile query failed:", profileResult.error);
      setProfile(null);
      setRole(null);
      throw profileResult.error;
    }

    if (roleResult.error) {
      console.error("[Auth] Role query failed:", roleResult.error);
      setProfile((profileResult.data as Profile) ?? null);
      setRole(null);
      throw roleResult.error;
    }

    setProfile((profileResult.data as Profile) ?? null);
    setRole((roleResult.data?.role as AppRole) ?? null);
  };

  useEffect(() => {
    let active = true;
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!active) return;
      setSession(s);
      setTimeout(() => {
        void loadProfile(s?.user?.id)
          .catch(() => undefined)
          .finally(() => setLoading(false));
      }, 0);
    });

    void supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      await loadProfile(data.session?.user?.id).catch(() => undefined);
      setLoading(false);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value: AuthState = {
    session,
    user: session?.user ?? null,
    profile,
    role,
    loading,
    refresh: async () => {
      await loadProfile(session?.user?.id).catch(() => undefined);
    },
    signOut: async () => {
      await supabase.auth.signOut();
      setProfile(null);
      setRole(null);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
