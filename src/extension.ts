/**
 * The thin VS Code adapter: registration, secret storage, commands and the status bar. Everything
 * it calls is tested elsewhere; it holds no logic of its own beyond wiring.
 */
import * as vscode from "vscode";
import {
  checkConnection,
  getModels,
  stateFromCode,
  type ClientOptions,
  type ConnectionState,
} from "./client";
import { codeOf } from "./codes";
import type { ChatPart } from "./convert";
import { discoverServer, readTextFile, type NoServerReason, type Target } from "./discovery";
import { readKey, removeKey, saveKey } from "./keys";
import { CallLog } from "./log";
import {
  describeCode,
  describeNoServer,
  formatReport,
  STATUS_LABELS,
  STATUS_TOOLTIP,
  UI,
} from "./messages";
import { ChatProvider, type Host, type Resolution } from "./provider";
import { closeAgents, loadCaFile } from "./transport";

const PREFIX = "assistantCabinetCoder";
const VENDOR = "assistantcabinetcoder";
const COMMANDS = {
  manage: `${PREFIX}.manage`,
  setKey: `${PREFIX}.setKey`,
  clearKey: `${PREFIX}.clearKey`,
  selectCaFile: `${PREFIX}.selectCaFile`,
  testConnection: `${PREFIX}.testConnection`,
  showOutput: `${PREFIX}.showOutput`,
} as const;

type Resolved =
  { ok: true; target: Target; options: ClientOptions } | { ok: false; reason: NoServerReason };

function toSignal(token: vscode.CancellationToken): AbortSignal {
  const controller = new AbortController();
  if (token.isCancellationRequested) {
    controller.abort();
  } else {
    token.onCancellationRequested(() => controller.abort());
  }
  return controller.signal;
}

function toEditorPart(part: ChatPart): vscode.LanguageModelResponsePart {
  return part.kind === "text"
    ? new vscode.LanguageModelTextPart(part.value)
    : new vscode.LanguageModelToolCallPart(part.callId, part.name, part.input);
}

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel(UI.outputChannelName);
  const log = new CallLog((line) => output.appendLine(line));
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
  status.command = COMMANDS.manage;
  status.tooltip = STATUS_TOOLTIP;
  let refreshCounter = 0;
  const modelChanges = new vscode.EventEmitter<void>();

  async function resolve(): Promise<Resolved> {
    const config = vscode.workspace.getConfiguration(PREFIX);
    const outcome = await discoverServer({
      serverUrl: config.get<string>("serverUrl", ""),
      caFile: config.get<string>("caFile", ""),
      autoDiscover: config.get<boolean>("autoDiscover", true),
      platform: process.platform,
      env: process.env,
      readText: (file) => readTextFile(file),
    });
    if (!outcome.ok) {
      return outcome;
    }
    const seconds = config.get<number>("requestTimeoutSeconds", 900);
    const options: ClientOptions = {
      baseUrl: outcome.target.url,
      caFile: outcome.target.caFile,
      apiKey: await readKey(context.secrets, outcome.target.url),
      timeoutSeconds: Number.isFinite(seconds) ? Math.min(Math.max(seconds, 1), 3600) : 900,
      onCall: (summary) => log.record(summary),
    };
    return { ok: true, target: outcome.target, options };
  }

  const host: Host = {
    resolve: async (): Promise<Resolution> => {
      const resolved = await resolve();
      return resolved.ok
        ? { ok: true, url: resolved.target.url, options: resolved.options }
        : resolved;
    },
    show: (text, offerKey) => {
      const actions = offerKey === true ? [UI.actionSetKey] : [];
      void vscode.window.showWarningMessage(text, ...actions).then((choice) => {
        if (choice === UI.actionSetKey) {
          void vscode.commands.executeCommand(COMMANDS.setKey);
        }
      });
    },
    log: (record) => log.record(record),
    fireChange: () => modelChanges.fire(),
  };
  const provider = new ChatProvider(host);

  function showState(state: ConnectionState): void {
    status.text = STATUS_LABELS[state];
    status.show();
  }

  async function refreshStatus(): Promise<void> {
    provider.invalidate();
    const ticket = ++refreshCounter;
    const resolved = await resolve();
    if (ticket !== refreshCounter) {
      return;
    }
    if (!resolved.ok) {
      if (resolved.reason === "invalid_server_url") {
        showState("error");
      } else {
        status.hide();
      }
      return;
    }
    let state: ConnectionState = "connected";
    try {
      await getModels(resolved.options);
    } catch (error) {
      state = stateFromCode(codeOf(error));
    }
    if (ticket === refreshCounter) {
      showState(state);
    }
  }

  async function setKey(): Promise<void> {
    const resolved = await resolve();
    if (!resolved.ok) {
      void vscode.window.showWarningMessage(UI.noServerForKey);
      return;
    }
    const input = await vscode.window.showInputBox({
      prompt: UI.keyPrompt,
      placeHolder: UI.keyPlaceholder,
      password: true,
      ignoreFocusOut: true,
    });
    if (input === undefined) {
      return;
    }
    if (await saveKey(context.secrets, resolved.target.url, input)) {
      void vscode.window.showInformationMessage(UI.keySaved);
      void refreshStatus();
    } else {
      void vscode.window.showErrorMessage(UI.keyInvalid);
    }
  }

  async function clearKey(): Promise<void> {
    const resolved = await resolve();
    if (!resolved.ok) {
      void vscode.window.showWarningMessage(UI.noServerForKey);
      return;
    }
    await removeKey(context.secrets, resolved.target.url);
    void vscode.window.showInformationMessage(UI.keyCleared);
    void refreshStatus();
  }

  async function selectCaFile(): Promise<void> {
    const picked = await vscode.window.showOpenDialog({
      canSelectMany: false,
      canSelectFiles: true,
      canSelectFolders: false,
      title: UI.caDialogTitle,
      openLabel: UI.caDialogButton,
      filters: { Certificates: ["pem", "crt", "cer"] },
    });
    const file = picked?.[0]?.fsPath;
    if (file === undefined) {
      return;
    }
    try {
      await loadCaFile(file);
    } catch (error) {
      void vscode.window.showErrorMessage(describeCode(codeOf(error)));
      return;
    }
    await vscode.workspace
      .getConfiguration(PREFIX)
      .update("caFile", file, vscode.ConfigurationTarget.Global);
    void vscode.window.showInformationMessage(UI.caSaved);
    void refreshStatus();
  }

  async function testConnection(): Promise<void> {
    const resolved = await resolve();
    if (!resolved.ok) {
      const choice = await vscode.window.showWarningMessage(
        describeNoServer(resolved.reason),
        { modal: true },
        UI.actionOpenSettings,
      );
      if (choice === UI.actionOpenSettings) {
        void vscode.commands.executeCommand("workbench.action.openSettings", PREFIX);
      }
      return;
    }
    const report = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: UI.testing, cancellable: true },
      (_progress, token) => checkConnection(resolved.options, toSignal(token)),
    );
    showState(stateFromCode(report.failure?.code));
    const text = formatReport(report, resolved.target.url);
    const code = report.failure?.code;
    const actions =
      code === "key_needed"
        ? [UI.actionSetKey]
        : code === "certificate_untrusted"
          ? [UI.actionSelectCaFile]
          : [];
    const show = text.ok ? vscode.window.showInformationMessage : vscode.window.showWarningMessage;
    const choice = await show(text.headline, { modal: true, detail: text.detail }, ...actions);
    if (choice === UI.actionSetKey) {
      await setKey();
    } else if (choice === UI.actionSelectCaFile) {
      await selectCaFile();
    }
  }

  async function manage(): Promise<void> {
    const items = [
      { label: UI.manageItems.setKey, command: COMMANDS.setKey },
      { label: UI.manageItems.clearKey, command: COMMANDS.clearKey },
      { label: UI.manageItems.selectCaFile, command: COMMANDS.selectCaFile },
      { label: UI.manageItems.testConnection, command: COMMANDS.testConnection },
      { label: UI.manageItems.showOutput, command: COMMANDS.showOutput },
    ];
    const picked = await vscode.window.showQuickPick(items, {
      title: UI.manageTitle,
      placeHolder: UI.managePlaceholder,
    });
    if (picked !== undefined) {
      await vscode.commands.executeCommand(picked.command);
    }
  }

  const languageModels: vscode.LanguageModelChatProvider = {
    onDidChangeLanguageModelChatInformation: modelChanges.event,
    provideLanguageModelChatInformation: (options) => provider.information(options.silent),
    provideLanguageModelChatResponse: (model, messages, options, progress, token) =>
      provider.chat(
        {
          model: { id: model.id, imageInput: model.capabilities.imageInput === true },
          // The editor sends a System role that its type declarations do not list, so roles go by name.
          messages: messages.map((entry) => ({
            role: String(vscode.LanguageModelChatMessageRole[entry.role]),
            content: entry.content,
          })),
          tools: options.tools,
          toolMode:
            options.toolMode === vscode.LanguageModelChatToolMode.Required ? "required" : "auto",
          modelOptions: options.modelOptions,
        },
        (part) => progress.report(toEditorPart(part)),
        toSignal(token),
      ),
    provideTokenCount: (model, input) =>
      Promise.resolve(
        provider.countTokens(
          model.id,
          typeof input === "string" ? input : { content: input.content },
        ),
      ),
  };

  context.subscriptions.push(
    output,
    status,
    modelChanges,
    vscode.lm.registerLanguageModelChatProvider(VENDOR, languageModels),
    vscode.commands.registerCommand(COMMANDS.manage, manage),
    vscode.commands.registerCommand(COMMANDS.setKey, setKey),
    vscode.commands.registerCommand(COMMANDS.clearKey, clearKey),
    vscode.commands.registerCommand(COMMANDS.selectCaFile, selectCaFile),
    vscode.commands.registerCommand(COMMANDS.testConnection, testConnection),
    vscode.commands.registerCommand(COMMANDS.showOutput, () => output.show()),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(PREFIX)) {
        void refreshStatus();
      }
    }),
    { dispose: closeAgents },
  );
  void refreshStatus();
}

export function deactivate(): void {
  closeAgents();
}
