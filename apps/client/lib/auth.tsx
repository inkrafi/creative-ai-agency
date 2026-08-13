"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { api, clearToken, getToken, setToken } from "./api";
import type { Organization, Role, UserProfile } from "./types";

interface JwtClaims {
  sub: string;
  tenantId: string;
  role: Role;
  email: string;
}

/** Decoded for display only -- the backend is what actually verifies the signature on every request. */
function decodeJwt(token: string): JwtClaims | null {
  try {
    const payload = token.split(".")[1];
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as JwtClaims;
  } catch {
    return null;
  }
}

interface AuthState {
  status: "loading" | "authenticated" | "unauthenticated";
  user: JwtClaims | null;
  organization: Organization | null;
  profile: UserProfile | null;
  login: (token: string) => Promise<void>;
  logout: () => void;
  /** Re-fetches /users/me -- called after the profile page saves a name change so the sidebar/greeting update without a full reload. */
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<AuthState["status"]>("loading");
  const [user, setUser] = useState<JwtClaims | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  async function hydrate(token: string) {
    const claims = decodeJwt(token);
    if (!claims) {
      clearToken();
      setStatus("unauthenticated");
      return;
    }
    try {
      const [org, me] = await Promise.all([
        api<Organization>("/organizations/me"),
        api<UserProfile>("/users/me"),
      ]);
      setUser(claims);
      setOrganization(org);
      setProfile(me);
      setStatus("authenticated");
    } catch {
      // Token rejected by the API (expired/invalid) -- same as never logging in.
      clearToken();
      setStatus("unauthenticated");
    }
  }

  async function refreshProfile() {
    setProfile(await api<UserProfile>("/users/me"));
  }

  useEffect(() => {
    const token = getToken();
    // hydrate() is an async status-machine transition (loading -> authenticated
    // | unauthenticated), not a synchronous setState -- intentional multi-stage
    // update, not the accidental-cascade pattern this rule targets.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (token) void hydrate(token);
    else setStatus("unauthenticated");
  }, []);

  async function login(token: string) {
    setToken(token);
    await hydrate(token);
  }

  function logout() {
    clearToken();
    setUser(null);
    setOrganization(null);
    setProfile(null);
    setStatus("unauthenticated");
    router.push("/login");
  }

  return (
    <AuthContext.Provider value={{ status, user, organization, profile, login, logout, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
