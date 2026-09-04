import { create } from "zustand";

import { apiRequest, configureApi, ApiError } from "./api";

type PublicUser = {
  id: string;
  email: string;
  displayName: string;
  role: string;
};

type TokenPair = { accessToken: string; refreshToken: string };
type AuthResponse = TokenPair & { user: PublicUser };

const ACCESS_KEY = "arcana-admin.accessToken";
const REFRESH_KEY = "arcana-admin.refreshToken";
const USER_KEY = "arcana-admin.user";

type AuthStatus = "loading" | "signedOut" | "signedIn";

type AuthState = {
  status: AuthStatus;
  user: PublicUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  error: string | null;
  hydrate: () => void;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
};

export const useAuthStore = create<AuthState>((set, get) => ({
  status: "loading",
  user: null,
  accessToken: null,
  refreshToken: null,
  error: null,

  hydrate: () => {
    if (typeof window === "undefined") return;
    const accessToken = window.localStorage.getItem(ACCESS_KEY);
    const refreshToken = window.localStorage.getItem(REFRESH_KEY);
    const userJson = window.localStorage.getItem(USER_KEY);
    if (accessToken && refreshToken && userJson) {
      set({ accessToken, refreshToken, user: JSON.parse(userJson) as PublicUser, status: "signedIn" });
    } else {
      set({ status: "signedOut" });
    }
  },

  login: async (email, password) => {
    set({ error: null });
    try {
      const res = await apiRequest<AuthResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
        auth: false,
      });
      persistAuth(res);
      set({ user: res.user, accessToken: res.accessToken, refreshToken: res.refreshToken, status: "signedIn" });
    } catch (err) {
      set({ error: describeError(err) });
      throw err;
    }
  },

  logout: async () => {
    const { refreshToken } = get();
    set({ status: "signedOut", user: null, accessToken: null, refreshToken: null, error: null });
    window.localStorage.removeItem(ACCESS_KEY);
    window.localStorage.removeItem(REFRESH_KEY);
    window.localStorage.removeItem(USER_KEY);
    if (refreshToken) {
      apiRequest("/auth/logout", {
        method: "POST",
        body: JSON.stringify({ refreshToken }),
        auth: false,
      }).catch(() => {});
    }
  },

  clearError: () => set({ error: null }),
}));

function persistAuth(res: AuthResponse): void {
  window.localStorage.setItem(ACCESS_KEY, res.accessToken);
  window.localStorage.setItem(REFRESH_KEY, res.refreshToken);
  window.localStorage.setItem(USER_KEY, JSON.stringify(res.user));
}

function describeError(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return "Не удалось подключиться к серверу";
}

let refreshPromise: Promise<string | null> | null = null;

async function doRefresh(): Promise<string | null> {
  const { refreshToken } = useAuthStore.getState();
  if (!refreshToken) return null;
  try {
    const res = await apiRequest<TokenPair>("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
      auth: false,
    });
    window.localStorage.setItem(ACCESS_KEY, res.accessToken);
    window.localStorage.setItem(REFRESH_KEY, res.refreshToken);
    useAuthStore.setState({ accessToken: res.accessToken, refreshToken: res.refreshToken });
    return res.accessToken;
  } catch {
    await useAuthStore.getState().logout();
    return null;
  }
}

configureApi({
  getAccessToken: () => useAuthStore.getState().accessToken,
  onUnauthorized: () => {
    if (!refreshPromise) {
      refreshPromise = doRefresh().finally(() => {
        refreshPromise = null;
      });
    }
    return refreshPromise;
  },
});
