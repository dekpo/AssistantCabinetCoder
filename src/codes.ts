/**
 * Machine codes: the only thing that crosses module boundaries to describe a failure.
 * A code is never a sentence; `messages.ts` turns it into one at the last moment.
 */

/** Error codes of the server's envelope (docs/IDE-CONTRACT.md section 3, "Errors"). */
export const CONTRACT_ERROR_CODES = [
  "invalid_request",
  "model_alias_not_allowed",
  "model_not_permitted",
  "context_too_large",
  "payload_too_large",
  "provider_capability_unsupported",
  "provider_unreachable",
  "provider_error",
  "empty_answer",
  "server_busy",
  "rate_limited",
  "unauthorized",
] as const;

export type ContractErrorCode = (typeof CONTRACT_ERROR_CODES)[number];

/** Codes the extension adds: transport, configuration and protocol failures. */
export const EXTENSION_CODES = [
  "ide_surface_off",
  "key_needed",
  "unreachable",
  "certificate_untrusted",
  "ide_api_mismatch",
  "timeout",
  "cancelled",
  "server_not_configured",
  "invalid_server_url",
  "ca_file_unreadable",
  "ca_file_not_certificate",
  "ca_file_has_private_key",
  "response_too_large",
  "bad_response",
  "redirect_refused",
  "unexpected_response",
  "server_error",
  "invalid_stream",
  "stream_error",
  "stream_truncated",
] as const;

/** Every envelope code except `unauthorized`, which is `key_needed` (a 401 is always that). */
type EnvelopeMachineCode = Exclude<ContractErrorCode, "unauthorized">;

export type MachineCode = EnvelopeMachineCode | (typeof EXTENSION_CODES)[number];

export const MACHINE_CODES: readonly MachineCode[] = [
  ...CONTRACT_ERROR_CODES.filter((code): code is EnvelopeMachineCode => code !== "unauthorized"),
  ...EXTENSION_CODES,
];

export function isMachineCode(value: unknown): value is MachineCode {
  return typeof value === "string" && (MACHINE_CODES as readonly string[]).includes(value);
}

/** The machine code of an envelope's `error.code`, or `undefined` when the server sent another. */
export function codeFromEnvelope(code: unknown): MachineCode | undefined {
  if (code === "unauthorized") {
    return "key_needed";
  }
  if (
    typeof code === "string" &&
    (CONTRACT_ERROR_CODES as readonly string[]).includes(code) &&
    isMachineCode(code)
  ) {
    return code;
  }
  return undefined;
}

/**
 * The only error type the extension throws on purpose. `message` is the machine code itself, so
 * nothing the server (or the user) wrote can reach a log or a stack trace through it.
 * `detail` is a Node error code such as `ECONNREFUSED`, never text from a response.
 */
export class CabinetError extends Error {
  readonly code: MachineCode;
  readonly status: number | undefined;
  readonly detail: string | undefined;

  constructor(code: MachineCode, options: { status?: number; detail?: string } = {}) {
    super(code);
    this.name = "CabinetError";
    this.code = code;
    this.status = options.status;
    this.detail = options.detail;
  }
}

/** The machine code of any thrown value (an unexpected error is `unexpected_response`). */
export function codeOf(error: unknown): MachineCode {
  return error instanceof CabinetError ? error.code : "unexpected_response";
}
