import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

/** Key-value storage for tokens and preferences. On phones this is the system keychain
 * (expo-secure-store); that module has no web implementation, so the web build - used for
 * development previews - falls back to localStorage. */
const web = Platform.OS === "web";

export async function getItemAsync(key: string): Promise<string | null> {
  if (!web) return SecureStore.getItemAsync(key);
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  if (!web) return SecureStore.setItemAsync(key, value);
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // Storage may be unavailable (private window); the session simply won't persist.
  }
}

export async function deleteItemAsync(key: string): Promise<void> {
  if (!web) return SecureStore.deleteItemAsync(key);
  try {
    globalThis.localStorage?.removeItem(key);
  } catch {
    // see setItemAsync
  }
}
