import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Keychain-backed session storage for the Supabase auth client.
 *
 * Supabase's default React Native adapter is AsyncStorage, which writes to an
 * unencrypted SQLite file. A stolen or jailbroken device yields a working
 * refresh token from that file, so sessions go in the Keychain instead.
 *
 * ## The 2048-byte problem
 * `SecureStore` refuses values larger than 2048 bytes, and a Supabase session
 * — which carries a JWT plus user metadata — routinely exceeds that once custom
 * claims are in play. Rather than silently failing to persist (the failure mode
 * is "user is logged out every launch", which is easy to misdiagnose as a token
 * refresh bug), values are split across numbered chunk keys.
 *
 * Layout for a key `K` holding `n` chunks:
 *   K        -> "chunks:n"    (manifest)
 *   K.0..K.n -> value slices
 *
 * Values small enough to fit are written directly under `K` with no manifest,
 * so the common case costs a single Keychain round trip.
 */

/** Keychain's own limit is 2048 bytes; leave room for multibyte characters. */
const MAX_CHUNK_SIZE = 1800;
const MANIFEST_PREFIX = 'chunks:';

const options: SecureStore.SecureStoreOptions = {
  // Sessions should survive a reboot but must not sync to iCloud or restore
  // onto a different device from a backup — a refresh token is device-bound
  // credential material.
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

function chunkKey(key: string, index: number): string {
  return `${key}.${index}`;
}

async function clearChunks(key: string, count: number): Promise<void> {
  await Promise.all(
    Array.from({ length: count }, (_, index) =>
      SecureStore.deleteItemAsync(chunkKey(key, index), options)
    )
  );
}

function parseManifest(value: string | null): number | null {
  if (!value?.startsWith(MANIFEST_PREFIX)) return null;
  const count = Number.parseInt(value.slice(MANIFEST_PREFIX.length), 10);
  return Number.isInteger(count) && count > 0 ? count : null;
}

export const secureStorageAdapter = {
  async getItem(key: string): Promise<string | null> {
    const head = await SecureStore.getItemAsync(key, options);
    if (head === null) return null;

    const chunkCount = parseManifest(head);
    if (chunkCount === null) return head;

    const chunks = await Promise.all(
      Array.from({ length: chunkCount }, (_, index) =>
        SecureStore.getItemAsync(chunkKey(key, index), options)
      )
    );

    // A missing chunk means the write was interrupted or partially evicted.
    // Returning a truncated string would hand Supabase malformed JSON, so treat
    // it as absent and let the user re-authenticate.
    if (chunks.some((chunk) => chunk === null)) {
      await this.removeItem(key);
      return null;
    }

    return chunks.join('');
  },

  async setItem(key: string, value: string): Promise<void> {
    // Always clear a previous chunked write first: shrinking from 3 chunks to a
    // direct write would otherwise strand `K.0`-`K.2` in the Keychain forever.
    await this.removeItem(key);

    if (value.length <= MAX_CHUNK_SIZE) {
      await SecureStore.setItemAsync(key, value, options);
      return;
    }

    const chunks: string[] = [];
    for (let offset = 0; offset < value.length; offset += MAX_CHUNK_SIZE) {
      chunks.push(value.slice(offset, offset + MAX_CHUNK_SIZE));
    }

    // Write the slices before the manifest. If the process dies midway, the
    // manifest is absent and `getItem` reports no session — which is recoverable.
    // The reverse order would leave a manifest pointing at chunks that were
    // never written.
    await Promise.all(
      chunks.map((chunk, index) => SecureStore.setItemAsync(chunkKey(key, index), chunk, options))
    );
    await SecureStore.setItemAsync(key, `${MANIFEST_PREFIX}${chunks.length}`, options);
  },

  async removeItem(key: string): Promise<void> {
    const head = await SecureStore.getItemAsync(key, options);
    const chunkCount = parseManifest(head);

    if (chunkCount !== null) {
      await clearChunks(key, chunkCount);
    }

    await SecureStore.deleteItemAsync(key, options);
  },
};

/**
 * The adapter Supabase should use on this platform.
 *
 * `SecureStore` has no web implementation. Web is not a shipping target for
 * Ocular — the Vision pipeline is iOS-only — but the bundler still resolves this
 * module for `expo start --web`, so an in-memory fallback keeps that path from
 * throwing during development.
 */
export const sessionStorage = Platform.OS === 'web' ? createMemoryStorage() : secureStorageAdapter;

function createMemoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: async (key: string) => store.get(key) ?? null,
    setItem: async (key: string, value: string) => void store.set(key, value),
    removeItem: async (key: string) => void store.delete(key),
  };
}
