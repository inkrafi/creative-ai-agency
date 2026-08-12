"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { api, clearToken, getToken, setToken } from "./api";
import type { Organization, Role } from "./types";

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
  login: (token: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<AuthState["status"]>("loading");
  const [user, setUser] = useState<JwtClaims | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);

  async function hydrate(token: string) {
    const claims = decodeJwt(token);
    if (!claims) {
      clearToken();
      setStatus("unauthenticated");
      return;
    }
    try {
      const org = await api<Organization>("/organizations/me");
      setUser(claims);
      setOrganization(org);
      setStatus("authenticated");
    } catch {
      // Token rejected by the API (expired/invalid) -- same as never logging in.
      clearToken();
      setStatus("unauthenticated");
    }
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
    setStatus("unauthenticated");
    router.push("/login");
  }

  return (
    <AuthContext.Provider value={{ status, user, organization, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
