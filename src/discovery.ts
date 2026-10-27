/**
 * Finds the server: the configured address, or the settings of an installation on this machine.
 * Pure apart from `readTextFile`: the file reader is an argument, so tests use strings.
 * Only `server.env` is ever read (it holds no secret since the server's Lot 10). Nothing is
 * written, executed or forwarded; never the secrets folder, never the workspace.
 */
import { promises as fs } from "node:fs";
import { publicCaFile, serverEnvFile, type Environment } from "./platform";

export const MAX_ENV_FILE_BYTES = 64 * 1024;

/** Defaults of the server (docs/CONFIGURATION.md), used for a key the file does not set. */
export const DEFAULT_BIND_ADDRESS = "127.0.0.1";
export const DEFAULT_PORT = 8080;

const SETTING_KEYS = [
  "SERVER_BIND_ADDRESS",
  "SERVER_PORT",
  "TLS_MODE",
  "TLS_SUBJECT_ALT_NAMES",
  "AUTH_MODE",
] as const;

export type NoServerReason =
  | "invalid_server_url"
  | "autodiscover_off"
  | "unsupported_platform"
  | "no_installation"
  | "no_settings"
  | "invalid_port"
  | "invalid_address"
  | "no_tls_names";

export interface ServerSettings {
  bindAddress: string;
  port: number;
  tls: boolean;
  tlsNames: string[];
  authRequired: boolean;
}

export interface Target {
  /** `http(s)://host[:port]`, nothing else. */
  url: string;
  /** The authority file to trust, when one applies. */
  caFile: string | undefined;
  source: "setting" | "installation";
  /** Only known for an installation: the server says it needs a key. */
  authRequired: boolean | undefined;
}

export type DiscoveryOutcome = { ok: true; target: Target } | { ok: false; reason: NoServerReason };

export interface DiscoveryInput {
  serverUrl: string;
  caFile: string;
  autoDiscover: boolean;
  /** `process.platform`. */
  platform: string;
  env: Environment;
  /** The text of a file, or `undefined` when it is missing or unreadable. */
  readText: (file: string) => Promise<string | undefined>;
}

/**
 * Parses `KEY=VALUE` lines the way the server does: no quotes, `#` comment lines, the last word
 * wins. Unlike the server it does not reject unknown keys: they are ignored.
 */
export function parseEnvText(text: string): Map<string, string> {
  const values = new Map<string, string>();
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (const raw of body.split(/\r\n|\r|\n/)) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) {
      continue;
    }
    const at = line.indexOf("=");
    if (at < 0) {
      continue;
    }
    const key = line.slice(0, at).trim();
    const value = line.slice(at + 1).trim();
    if (!/^[A-Z][A-Z0-9_]*$/.test(key) || value.startsWith('"') || value.startsWith("'")) {
      continue;
    }
    values.set(key, value);
  }
  return values;
}

export function serverSettingsFromEnv(
  values: ReadonlyMap<string, string>,
): { ok: true; settings: ServerSettings } | { ok: false; reason: NoServerReason } {
  if (!SETTING_KEYS.some((key) => values.has(key))) {
    return { ok: false, reason: "no_settings" };
  }
  const portText = values.get("SERVER_PORT");
  const port = portText === undefined ? DEFAULT_PORT : Number(portText);
  if (
    !/^[0-9]{1,5}$/.test(portText ?? "0") ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
    return { ok: false, reason: "invalid_port" };
  }
  const bindAddress = values.get("SERVER_BIND_ADDRESS") ?? DEFAULT_BIND_ADDRESS;
  if (!isHostName(bindAddress)) {
    return { ok: false, reason: "invalid_address" };
  }
  const tlsNames = (values.get("TLS_SUBJECT_ALT_NAMES") ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name !== "");
  return {
    ok: true,
    settings: {
      bindAddress,
      port,
      tls: (values.get("TLS_MODE") ?? "off").toLowerCase() === "on",
      tlsNames,
      authRequired: (values.get("AUTH_MODE") ?? "off").toLowerCase() === "required",
    },
  };
}

function isHostName(value: string): boolean {
  if (value.includes(":")) {
    return /^[0-9A-Fa-f:.]+$/.test(value);
  }
  return /^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$/.test(value);
}

function isWildcard(address: string): boolean {
  return address === "0.0.0.0" || address === "::";
}

function bracketed(host: string): string {
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
}

/**
 * The address a client on this machine should use. A wildcard bind address is not an address one
 * can connect to: plain HTTP uses the loopback, HTTPS the first certificate name (the
 * certificate is valid only for those names).
 */
export function targetUrlFor(settings: ServerSettings): string | undefined {
  const scheme = settings.tls ? "https:" : "http:";
  let host = settings.bindAddress;
  if (isWildcard(host)) {
    const first = settings.tlsNames[0];
    if (settings.tls) {
      if (first === undefined) {
        return undefined;
      }
      host = first;
    } else {
      host = DEFAULT_BIND_ADDRESS;
    }
  }
  return normalizeServerUrl(`${scheme}//${bracketed(host)}:${settings.port}`);
}

/**
 * The origin of a configured address, or `undefined` when it is not usable: the scheme must be
 * http or https, there is no user name, password, path, query or fragment.
 */
export function normalizeServerUrl(input: string): string | undefined {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return undefined;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return undefined;
  }
  if (url.hostname === "" || url.username !== "" || url.password !== "") {
    return undefined;
  }
  if ((url.pathname !== "/" && url.pathname !== "") || url.search !== "" || url.hash !== "") {
    return undefined;
  }
  return url.origin;
}

export async function discoverServer(input: DiscoveryInput): Promise<DiscoveryOutcome> {
  const caSetting = input.caFile.trim() === "" ? undefined : input.caFile.trim();
  if (input.serverUrl.trim() !== "") {
    const url = normalizeServerUrl(input.serverUrl);
    if (url === undefined) {
      return { ok: false, reason: "invalid_server_url" };
    }
    return {
      ok: true,
      target: { url, caFile: caSetting, source: "setting", authRequired: undefined },
    };
  }
  if (!input.autoDiscover) {
    return { ok: false, reason: "autodiscover_off" };
  }
  const envFile = serverEnvFile(input.platform, input.env);
  if (envFile === undefined) {
    return { ok: false, reason: "unsupported_platform" };
  }
  const text = await input.readText(envFile);
  if (text === undefined) {
    return { ok: false, reason: "no_installation" };
  }
  const parsed = serverSettingsFromEnv(parseEnvText(text));
  if (!parsed.ok) {
    return parsed;
  }
  const url = targetUrlFor(parsed.settings);
  if (url === undefined) {
    return { ok: false, reason: "no_tls_names" };
  }
  const caFile =
    caSetting ?? (parsed.settings.tls ? publicCaFile(input.platform, input.env) : undefined);
  return {
    ok: true,
    target: { url, caFile, source: "installation", authRequired: parsed.settings.authRequired },
  };
}

/** Reads a small text file; `undefined` when it is missing, unreadable, or larger than the cap. */
export async function readTextFile(
  file: string,
  maxBytes: number = MAX_ENV_FILE_BYTES,
): Promise<string | undefined> {
  try {
    const info = await fs.stat(file);
    if (!info.isFile() || info.size > maxBytes) {
      return undefined;
    }
    return await fs.readFile(file, "utf8");
  } catch {
    return undefined;
  }
}
