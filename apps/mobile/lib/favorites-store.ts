import { create } from "zustand";

import { apiRequest } from "./api";
import type { StorySummary } from "./types";

type FavoritesState = {
  ids: string[];
  hydrate: () => Promise<void>;
  toggle: (storyId: string) => void;
};

/** Favorited story ids, backed by the /favorites endpoint (per-account, not
 * per-device - this replaces the SecureStore-only version from before that
 * endpoint existed). toggle() updates optimistically and rolls back if the
 * request fails, so the star never waits on a round trip to respond. */
export const useFavoritesStore = create<FavoritesState>((set, get) => ({
  ids: [],

  hydrate: async () => {
    try {
      const favorites = await apiRequest<StorySummary[]>("/favorites");
      set({ ids: favorites.map((story) => story.id) });
    } catch {
      // Signed-out, offline, etc. - leave ids as-is; toggle() below still
      // works optimistically even if the initial sync didn't land.
    }
  },

  toggle: (storyId) => {
    const wasFavorite = get().ids.includes(storyId);
    // Prepended, not appended - matches the server's "most recently
    // favorited first" ordering (see favorites_service.list_favorite_stories).
    set((state) => ({
      ids: wasFavorite ? state.ids.filter((id) => id !== storyId) : [storyId, ...state.ids],
    }));

    const request = wasFavorite
      ? apiRequest(`/favorites/${storyId}`, { method: "DELETE" })
      : apiRequest(`/favorites/${storyId}`, { method: "POST" });

    request.catch(() => {
      // Roll back to whatever the boolean was before this toggle, not just
      // "the opposite of current" - guards against two quick taps racing.
      set((state) => ({
        ids: wasFavorite ? [...state.ids, storyId] : state.ids.filter((id) => id !== storyId),
      }));
    });
  },
}));
