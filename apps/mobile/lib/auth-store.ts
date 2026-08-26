import * as SecureStore from "expo-secure-store";
import { create } from "zustand";

import { apiRequest, configureApi, ApiError } from "./api";
import type { AuthResponse, PublicUser, TokenPair } from "./types";

const ACCESS_KEY = "arcana.accessToken";
const REFRESH_KEY = "arcana.refreshToken";
const USER_KEY = "arcana.user";

type AuthStatus = "loading" | "signedOut" | "signedIn";

type AuthState = {
  status: AuthStatus;
  user: PublicUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  error: string | null;
  hydrate: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
};

export const useAuthStore = create<AuthState>((set, get) => ({
  status: "loading",
  user: null,
  accessToken: null,
  refreshToken: null,
  error: null,

  hydrate: async () => {
    const [accessToken, refreshToken, userJson] = await Promise.all([
      SecureStore.getItemAsync(ACCESS_KEY),
      SecureStore.getItemAsync(REFRESH_KEY),
      SecureStore.getItemAsync(USER_KEY),
    ]);
    if (accessToken && refreshToken && userJson) {
      set({
        accessToken,
        refreshToken,
        user: JSON.parse(userJson) as PublicUser,
        status: "signedIn",
      });
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
      await persistAuth(res);
      set({
        user: res.user,
        accessToken: res.accessToken,
        refreshToken: res.refreshToken,
        status: "signedIn",
      });
    } catch (err) {
      set({ error: describeError(err) });
      throw err;
    }
  },

  register: async (email, password, displayName) => {
    set({ error: null });
    try {
      const res = await apiRequest<AuthResponse>("/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password, displayName }),
        auth: false,
      });
      await persistAuth(res);
      set({
        user: res.user,
        accessToken: res.accessToken,
        refreshToken: res.refreshToken,
        status: "signedIn",
      });
    } catch (err) {
      set({ error: describeError(err) });
      throw err;
    }
  },

  logout: async () => {
    const { refreshToken } = get();
    set({ status: "signedOut", user: null, accessToken: null, refreshToken: null, error: null });
    await Promise.all([
      SecureStore.deleteItemAsync(ACCESS_KEY),
      SecureStore.deleteItemAsync(REFRESH_KEY),
      SecureStore.deleteItemAsync(USER_KEY),
    ]);
    if (refreshToken) {
      // Best-effort server-side revocation - the local session is already cleared either way.
      apiRequest("/auth/logout", {
        method: "POST",
        body: JSON.stringify({ refreshToken }),
        auth: false,
      }).catch(() => {});
    }
  },

  clearError: () => set({ error: null }),
}));

async function persistAuth(res: AuthResponse): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_KEY, res.accessToken),
    SecureStore.setItemAsync(REFRESH_KEY, res.refreshToken),
    SecureStore.setItemAsync(USER_KEY, JSON.stringify(res.user)),
  ]);
}

function describeError(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return "Не удалось подключиться к серверу";
}

// Wire the plain api.ts module to this store so every apiRequest() call can transparently
// refresh an expired access token once and retry, without any component knowing about it.
configureApi({
  getAccessToken: () => useAuthStore.getState().accessToken,
  onUnauthorized: async () => {
    const { refreshToken } = useAuthStore.getState();
    if (!refreshToken) return null;
    try {
      const res = await apiRequest<TokenPair>("/auth/refresh", {
        method: "POST",
        body: JSON.stringify({ refreshToken }),
        auth: false,
      });
      await Promise.all([
        SecureStore.setItemAsync(ACCESS_KEY, res.accessToken),
        SecureStore.setItemAsync(REFRESH_KEY, res.refreshToken),
      ]);
      useAuthStore.setState({ accessToken: res.accessToken, refreshToken: res.refreshToken });
      return res.accessToken;
    } catch {
      await useAuthStore.getState().logout();
      return null;
    }
  },
});
