const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000";
const TOKEN_KEY = "kravio_token";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  window.localStorage.removeItem(TOKEN_KEY);
}

/**
 * Thin fetch wrapper -- attaches the bearer token, throws ApiError with the
 * backend's own message on non-2xx (class-validator's whitelist errors come
 * through as `message: string[]`, joined here into one readable string).
 *
 * The token lives in localStorage, same as apps/api/public/index.html's dev
 * UI -- not an httpOnly cookie. That's a real tradeoff (JS-readable tokens
 * are exposed to XSS), accepted here because the API only issues bearer
 * tokens today; a cookie-based flow would need a server-side proxy or
 * backend changes neither of which exist yet. Worth revisiting before this
 * is used somewhere with third-party scripts, but a very common shape for
 * an internal tool talking to a REST API it doesn't control the session for.
 */
export async function api<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });

  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = (await res.json()) as { message?: string | string[] };
      if (Array.isArray(body.message)) message = body.message.join(", ");
      else if (body.message) message = body.message;
    } catch {
      // Response body wasn't JSON -- keep statusText.
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export { API_BASE };
