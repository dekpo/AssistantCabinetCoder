/**
 * The API key: kept only in the editor's secret store, under a fixed name per server address.
 * `SecretStore` is the shape of `vscode.SecretStorage`, so this module needs no editor to test.
 * A key is never printed, logged or put in an error.
 */
import { normalizeServerUrl } from "./discovery";

export interface SecretStore {
  get(name: string): PromiseLike<string | undefined>;
  store(name: string, value: string): PromiseLike<void>;
  delete(name: string): PromiseLike<void>;
}

export const MAX_KEY_LENGTH = 512;

/** The secret-store name for a server address, or `undefined` when the address is not valid. */
export function secretName(serverUrl: string): string | undefined {
  const origin = normalizeServerUrl(serverUrl);
  return origin === undefined ? undefined : `assistantCabinetCoder.apiKey:${origin}`;
}

/** The key without surrounding blanks, or `undefined` when it is empty or cannot be a header value. */
export function cleanKey(input: string | undefined): string | undefined {
  if (input === undefined) {
    return undefined;
  }
  const key = input.trim();
  if (key === "" || key.length > MAX_KEY_LENGTH || !/^[\x21-\x7e]+$/.test(key)) {
    return undefined;
  }
  return key;
}

export async function readKey(store: SecretStore, serverUrl: string): Promise<string | undefined> {
  const name = secretName(serverUrl);
  if (name === undefined) {
    return undefined;
  }
  return cleanKey(await store.get(name));
}

/** Stores the key; returns `false` when the address or the key is not usable. */
export async function saveKey(
  store: SecretStore,
  serverUrl: string,
  input: string | undefined,
): Promise<boolean> {
  const name = secretName(serverUrl);
  const key = cleanKey(input);
  if (name === undefined || key === undefined) {
    return false;
  }
  await store.store(name, key);
  return true;
}

export async function removeKey(store: SecretStore, serverUrl: string): Promise<boolean> {
  const name = secretName(serverUrl);
  if (name === undefined) {
    return false;
  }
  await store.delete(name);
  return true;
}
