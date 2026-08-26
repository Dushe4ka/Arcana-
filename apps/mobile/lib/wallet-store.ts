import { create } from "zustand";

import { apiRequest, ApiError } from "./api";
import type { DailyRewardClaim, Wallet } from "./types";

type WalletState = {
  wallet: Wallet | null;
  loading: boolean;
  error: string | null;
  fetch: () => Promise<void>;
  claimDaily: () => Promise<DailyRewardClaim>;
};

export const useWalletStore = create<WalletState>((set, get) => ({
  wallet: null,
  loading: false,
  error: null,

  fetch: async () => {
    set({ loading: true, error: null });
    try {
      const wallet = await apiRequest<Wallet>("/wallet");
      set({ wallet, loading: false });
    } catch (err) {
      set({ loading: false, error: err instanceof ApiError ? err.message : "Не удалось загрузить кошелёк" });
    }
  },

  claimDaily: async () => {
    const result = await apiRequest<DailyRewardClaim>("/wallet/daily-reward/claim", {
      method: "POST",
    });
    await get().fetch();
    return result;
  },
}));
