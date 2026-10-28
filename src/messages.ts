/**
 * Every sentence the user can read, in English, in one place. Machine codes cross module
 * boundaries; they become sentences here and nowhere else. No address literal lives here, except
 * documentation links.
 */
import type { ConnectionReport, ConnectionState } from "./client";
import type { MachineCode } from "./codes";
import type { ConvertReason } from "./convert";
import type { NoServerReason } from "./discovery";

/** One sentence per machine code. */
export const CODE_MESSAGES: Record<MachineCode, string> = {
  ide_surface_off:
    "The server has not turned on the editor surface. Ask the administrator to run: cabinet-server config set IDE_ENABLED=on, then cabinet-server restart.",
  key_needed:
    "The server needs a valid API key. Choose Set API Key and enter the key the administrator created for this computer.",
  unreachable:
    "The server cannot be reached. Check the address, that the server is running, and that this computer is on the same network.",
  certificate_untrusted:
    "This computer does not trust the server's certificate. Choose Select CA File and pick the ca.pem file the administrator gave you, and make sure the server address uses a name that the certificate lists.",
  ide_api_mismatch:
    "The server speaks a different version of the editor interface than this extension. Update the extension or the server so that both use the same version.",
  timeout:
    "The server did not answer in time: nothing arrived for the number of seconds set in the request timeout setting.",
  cancelled: "The request was cancelled.",
  server_not_configured:
    "No server is configured and none was found on this computer. Set the server address in the settings.",
  invalid_server_url:
    "The server address is not valid. It must start with http:// or https:// and contain only a host name or an IP address and, if needed, a port.",
  ca_file_unreadable:
    "The authority file cannot be read. Older server installations have no public copy of it: ask the administrator for ca.pem and choose it with Select CA File.",
  ca_file_not_certificate:
    "The authority file is not a certificate in PEM format. Choose the ca.pem file the administrator gave you.",
  ca_file_has_private_key:
    "The authority file contains a private key. It was refused. Choose the public ca.pem file; never share a private key.",
  response_too_large:
    "The server's answer is larger than this extension accepts, so it was dropped.",
  bad_response:
    "The server answered, but not in the expected format. Check that the address is the server's.",
  redirect_refused:
    "The server answered with a redirect, which this extension does not follow. Check the server address.",
  unexpected_response:
    "The server answered in a way this extension does not understand. Check that the address is the server's.",
  server_error: "The server reported an internal problem. Try again, or ask the administrator.",
  invalid_stream: "The server's answer stream was damaged and was stopped.",
  stream_error: "The server reported an error while answering.",
  stream_truncated: "The server's answer stopped before it was complete.",
  invalid_request: "The server refused the request as malformed.",
  model_alias_not_allowed: "The server does not offer this model.",
  model_not_permitted: "The server does not allow this model for this request.",
  context_too_large:
    "The conversation is too long for this model. Start a new chat or attach less.",
  payload_too_large: "The request is larger than the server accepts. Attach less.",
  provider_capability_unsupported:
    "This model cannot do what the request asked (for example read images).",
  provider_unreachable:
    "The server cannot reach its model engine. Ask the administrator to check the server.",
  provider_error: "The model engine reported an error. Try again.",
  empty_answer: "The model returned nothing. Try again.",
  server_busy: "The server is busy with other requests. Try again in a moment.",
  rate_limited: "Too many requests were sent. Wait a moment and try again.",
};

export function describeCode(code: MachineCode): string {
  return CODE_MESSAGES[code];
}

/** Why no server could be found (the settings that fix it are named). */
export const NO_SERVER_MESSAGES: Record<NoServerReason, string> = {
  invalid_server_url: CODE_MESSAGES.invalid_server_url,
  autodiscover_off:
    "No server address is set and automatic discovery is off. Set the server address in the settings, or turn automatic discovery on.",
  unsupported_platform:
    "Automatic discovery works only on Windows and macOS. Set the server address in the settings.",
  no_installation:
    "No server is installed on this computer. Set the server address in the settings.",
  no_settings:
    "The server's settings file was found but holds no address. Set the server address in the settings.",
  invalid_port:
    "The server's settings file has a port that is not valid. Set the server address in the settings.",
  invalid_address:
    "The server's settings file has an address that is not valid. Set the server address in the settings.",
  no_tls_names:
    "The server uses HTTPS on all addresses but lists no certificate name. Set the server address in the settings.",
};

export function describeNoServer(reason: NoServerReason): string {
  return NO_SERVER_MESSAGES[reason];
}

export const STATUS_LABELS: Record<ConnectionState, string> = {
  connected: "Cabinet: connected",
  off: "Cabinet: off",
  key_needed: "Cabinet: key needed",
  unreachable: "Cabinet: unreachable",
  certificate: "Cabinet: certificate",
  version: "Cabinet: version",
  error: "Cabinet: error",
};

export const STATUS_TOOLTIP = "Assistant Cabinet Coder. Click to manage the connection.";

export const UI = {
  outputChannelName: "Assistant Cabinet Coder",
  manageTitle: "Assistant Cabinet Coder",
  managePlaceholder: "Choose what to do",
  manageItems: {
    setKey: "Set API Key",
    clearKey: "Clear API Key",
    selectCaFile: "Select CA File",
    testConnection: "Test Connection",
    showOutput: "Show Output",
  },
  keyPrompt: "API key for this server",
  keyPlaceholder: "Paste the key the administrator gave you",
  keyInvalid: "That key cannot be used: it must be one line of visible characters, without spaces.",
  keySaved: "The API key was saved in the secret store.",
  keyCleared: "The API key was removed.",
  noServerForKey: "Set the server address first: the key is kept per server.",
  caDialogTitle: "Select the authority file (ca.pem)",
  caDialogButton: "Use This File",
  caSaved: "The authority file was set.",
  testing: "Testing the connection...",
  actionSetKey: "Set API Key",
  actionSelectCaFile: "Select CA File",
  actionOpenSettings: "Open Settings",
  providerDetail: "Assistant Cabinet Coder",
  providerMismatch:
    "This extension and this server do not match: the server speaks a different version of the editor interface. Update the extension or the server so that both use the same version.",
} as const;

/** Short texts added to what the model receives; neutral about who the user is. */
export const CONVERSION_NOTES = {
  imageFromTool: (toolName: string | undefined): string =>
    toolName === undefined
      ? "Image returned by a tool."
      : `Image returned by the tool ${toolName}.`,
  resultPartLeftOut:
    "[A part of this tool result could not be passed to the model and was left out.]",
  resultIsImage: "[This tool returned an image, given in the next message.]",
  resultEmpty: "[This tool returned no text.]",
} as const;

/** Why a request was refused before sending, or a model answer could not be used. */
export const CONVERSION_MESSAGES: Record<ConvertReason, string> = {
  unknown_role:
    "The chat sent a message with a role this extension does not know, so the request was not sent.",
  unsupported_part:
    "The chat sent content this extension cannot pass to the model (it carries text, PNG, JPEG, WebP and GIF images, tool calls and tool results), so the request was not sent.",
  image_without_vision:
    "This model cannot read images, so the request was not sent. Choose a model that reports vision, or start a new chat without the image: images stay in the chat history and are sent again with every request.",
  bad_tool_call: "The model sent a tool call without a name. Try again.",
  bad_tool_arguments:
    "The model sent a tool call whose arguments are not valid. Try again, or choose another model.",
};

/** The sentence for a conversion failure; the tool is named only when the caller verified its name. */
export function describeConversionFailure(
  reason: ConvertReason,
  toolName: string | undefined,
): string {
  if (reason === "bad_tool_arguments" && toolName !== undefined) {
    return `The model called the tool ${toolName} with arguments that are not valid. Try again, or choose another model.`;
  }
  return CONVERSION_MESSAGES[reason];
}

/** The tooltip of a model in the picker: what the server reported, and what was assumed. */
export function describeModelTooltip(
  model: {
    contextWindow: number | undefined;
    maxOutputTokens: number | undefined;
    tools: boolean;
    vision: boolean;
  },
  fallback: { window: number; output: number },
): string {
  const lines = [
    model.contextWindow === undefined
      ? `Context window: not reported by the server, ${fallback.window} tokens assumed.`
      : `Context window: ${model.contextWindow} tokens.`,
    model.maxOutputTokens === undefined
      ? `Output ceiling: not reported by the server, ${fallback.output} tokens assumed.`
      : `Output ceiling: ${model.maxOutputTokens} tokens.`,
    `Tool calling: ${yesNo(model.tools)}. Image input: ${yesNo(model.vision)}.`,
  ];
  if (!model.tools) {
    lines.push("Without tool calling VS Code does not offer this model in the chat.");
  }
  if (model.contextWindow !== undefined && model.contextWindow < 32768) {
    lines.push("Agent and Plan work best with a window of 32768 tokens or more.");
  }
  return lines.join("\n");
}

function yesNo(value: boolean): string {
  return value ? "yes" : "no";
}

function tokens(value: number | undefined): string {
  return value === undefined ? "unknown" : `${value} tokens`;
}

/** The text of the Test Connection dialog: a headline and the lines under it. */
export function formatReport(
  report: ConnectionReport,
  serverUrl: string,
): { ok: boolean; headline: string; detail: string } {
  const lines: string[] = [`Server: ${serverUrl}`];
  if (report.failure !== undefined && report.failure.call === "health") {
    lines.push("Health check: failed.");
    lines.push(describeCode(report.failure.code));
    if (report.failure.detail !== undefined) {
      lines.push(`Technical detail: ${report.failure.detail}`);
    }
    return { ok: false, headline: "Cannot reach the server", detail: lines.join("\n") };
  }
  lines.push("Health check: the server answered.");
  if (report.failure !== undefined || report.models === undefined) {
    const failure = report.failure ?? { code: "unexpected_response" as const };
    lines.push(describeCode(failure.code));
    if ("detail" in failure && failure.detail !== undefined) {
      lines.push(`Technical detail: ${failure.detail}`);
    }
    return {
      ok: false,
      headline: "The server is reachable but not ready",
      detail: lines.join("\n"),
    };
  }
  const { models, features, ideApi } = report.models;
  lines.push(`Editor interface version: ${ideApi}`);
  lines.push(
    `Features: agents ${yesNo(features.agents)}, document analysis ${yesNo(features.documentAnalysis)}, image description ${yesNo(features.imageDescription)}`,
  );
  lines.push(`Models (${models.length}):`);
  for (const model of models) {
    lines.push(
      `- ${model.id}: window ${tokens(model.contextWindow)}, output up to ${tokens(model.maxOutputTokens)}, tools ${yesNo(model.tools)}, vision ${yesNo(model.vision)}`,
    );
  }
  for (const model of models.filter((candidate) => !candidate.tools)) {
    lines.push(
      `Note: ${model.id} does not report tool calling. VS Code 1.143.1 does not offer such a model in the chat picker in any mode (measured on that version).`,
    );
  }
  const headline =
    models.length === 1
      ? "Connected: 1 model available"
      : `Connected: ${models.length} models available`;
  return { ok: true, headline, detail: lines.join("\n") };
}
