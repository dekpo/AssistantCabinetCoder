/**
 * The only module that names operating-system folders. The platform and the environment are
 * arguments, so every layout is tested on any machine. A new platform is an added branch here.
 * Both layouts follow the server's `paths.py` (checked on 27 October 2026).
 */
import * as path from "node:path";

export type PlatformKind = "windows" | "macos" | "other";

export type Environment = Readonly<Record<string, string | undefined>>;

const PRODUCT_FOLDER = "AssistantCabinetServer";
const WINDOWS_DEFAULT_PROGRAM_DATA = "C:\\ProgramData";
const MACOS_SUPPORT_FOLDER = "/Library/Application Support";

export const SERVER_ENV_FILE_NAME = "server.env";
/** The public copy of the authority certificate, kept beside `server.env` (never a key). */
export const PUBLIC_CA_FILE_NAME = "ca.pem";

/** `nodePlatform` is the value of `process.platform`. */
export function platformKind(nodePlatform: string): PlatformKind {
  if (nodePlatform === "win32") {
    return "windows";
  }
  if (nodePlatform === "darwin") {
    return "macos";
  }
  return "other";
}

function programData(env: Environment): string {
  const value = env["ProgramData"] ?? env["PROGRAMDATA"];
  return value !== undefined && path.win32.isAbsolute(value) ? value : WINDOWS_DEFAULT_PROGRAM_DATA;
}

/** The `config` folder of a server installed on this machine, or `undefined` on other platforms. */
export function serverConfigFolder(nodePlatform: string, env: Environment): string | undefined {
  switch (platformKind(nodePlatform)) {
    case "windows":
      return path.win32.join(programData(env), PRODUCT_FOLDER, "config");
    case "macos":
      return path.posix.join(MACOS_SUPPORT_FOLDER, PRODUCT_FOLDER, "config");
    case "other":
      return undefined;
  }
}

function fileInConfigFolder(
  nodePlatform: string,
  env: Environment,
  name: string,
): string | undefined {
  const folder = serverConfigFolder(nodePlatform, env);
  if (folder === undefined) {
    return undefined;
  }
  return platformKind(nodePlatform) === "windows"
    ? path.win32.join(folder, name)
    : path.posix.join(folder, name);
}

export function serverEnvFile(nodePlatform: string, env: Environment): string | undefined {
  return fileInConfigFolder(nodePlatform, env, SERVER_ENV_FILE_NAME);
}

export function publicCaFile(nodePlatform: string, env: Environment): string | undefined {
  return fileInConfigFolder(nodePlatform, env, PUBLIC_CA_FILE_NAME);
}
