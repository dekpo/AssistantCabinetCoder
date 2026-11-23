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
  describeProposalTitle,
  formatReport,
  STATUS_LABELS,
  STATUS_TOOLTIP,
  UI,
} from "./messages";
import { registerChatView } from "./panel";
import { ChatProvider, type Host, type Resolution } from "./provider";
import type { SessionWorkspace } from "./session";
import type { EditProposal } from "./tools";
import { closeAgents, loadCaFile } from "./transport";
import { nodeWorkspaceFs } from "./workspace";

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

/** The scheme of the read-only documents that show a proposed change in the diff view. */
const PROPOSAL_SCHEME = "assistant-cabinet-coder-proposal";

/**
 * The editor side of the panel's tools (Lot P0b): whether they may run, the workspace folders, the
 * read-only file system, the diff view of a proposed change (a read-only virtual document on the
 * right) and the edit itself, applied with `WorkspaceEdit` only after the user's click, so that the
 * editor's Undo reverts it, then saved so that the next read sees it.
 */
function editorWorkspace(): { workspace: SessionWorkspace; registration: vscode.Disposable } {
  const contents = new Map<string, string>();
  const views = new WeakMap<EditProposal, { left: vscode.Uri; right: vscode.Uri }>();
  let counter = 0;

  function viewOf(proposal: EditProposal): { left: vscode.Uri; right: vscode.Uri } {
    let view = views.get(proposal);
    if (view === undefined) {
      counter += 1;
      const right = vscode.Uri.from({
        scheme: PROPOSAL_SCHEME,
        path: `/${proposal.display}`,
        query: `proposal-${counter}`,
      });
      const left =
        proposal.kind === "edit"
          ? vscode.Uri.file(proposal.absolute)
          : vscode.Uri.from({
              scheme: PROPOSAL_SCHEME,
              path: `/${proposal.display}`,
              query: `empty-${counter}`,
            });
      contents.set(right.toString(), proposal.after);
      contents.set(left.toString(), "");
      view = { left, right };
      views.set(proposal, view);
    }
    return view;
  }

  const workspace: SessionWorkspace = {
    availability: () =>
      !vscode.workspace.isTrusted
        ? "untrusted"
        : (vscode.workspace.workspaceFolders ?? []).some((folder) => folder.uri.scheme === "file")
          ? "on"
          : "no_folder",
    roots: () =>
      (vscode.workspace.workspaceFolders ?? [])
        .filter((folder) => folder.uri.scheme === "file")
        .map((folder) => folder.uri.fsPath),
    fs: nodeWorkspaceFs,
    showProposal: async (proposal) => {
      const { left, right } = viewOf(proposal);
      await vscode.commands.executeCommand(
        "vscode.diff",
        left,
        right,
        describeProposalTitle(proposal.display),
        { preview: true, preserveFocus: true },
      );
    },
    closeProposal: async (proposal) => {
      const view = views.get(proposal);
      if (view === undefined) {
        return;
      }
      const tabs = vscode.window.tabGroups.all
        .flatMap((group) => group.tabs)
        .filter(
          (tab) =>
            tab.input instanceof vscode.TabInputTextDiff &&
            tab.input.modified.toString() === view.right.toString(),
        );
      contents.delete(view.right.toString());
      contents.delete(view.left.toString());
      if (tabs.length > 0) {
        await vscode.window.tabGroups.close(tabs, true);
      }
    },
    applyProposal: async (proposal) => {
      const uri = vscode.Uri.file(proposal.absolute);
      const edit = new vscode.WorkspaceEdit();
      if (proposal.kind === "create") {
        const exists = await vscode.workspace.fs.stat(uri).then(
          () => true,
          () => false,
        );
        if (exists) {
          return "file_changed";
        }
        edit.createFile(uri, { contents: new TextEncoder().encode(proposal.after) });
        return (await vscode.workspace.applyEdit(edit)) ? "applied" : "not_applied";
      }
      const document = await vscode.workspace.openTextDocument(uri);
      if (document.isDirty) {
        return "unsaved_changes";
      }
      if (document.getText() !== proposal.before) {
        return "file_changed";
      }
      edit.replace(
        uri,
        new vscode.Range(document.positionAt(proposal.start), document.positionAt(proposal.end)),
        proposal.newText,
      );
      if (!(await vscode.workspace.applyEdit(edit))) {
        return "not_applied";
      }
      await document.save();
      // The changed file is shown, so that the editor's Undo is one key away.
      await vscode.window.showTextDocument(document, { preview: true, preserveFocus: true });
      return "applied";
    },
  };

  const registration = vscode.workspace.registerTextDocumentContentProvider(PROPOSAL_SCHEME, {
    provideTextDocumentContent: (uri) => contents.get(uri.toString()) ?? "",
  });
  return { workspace, registration };
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
  const tools = editorWorkspace();
  const chatView = registerChatView(context, {
    resolve: () => host.resolve(),
    log: (record) => log.record(record),
    workspace: tools.workspace,
  });

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
      void chatView.session.refreshModels();
      if (resolved.reason === "invalid_server_url") {
        showState("error");
      } else {
        status.hide();
      }
      return;
    }
    let state: ConnectionState = "connected";
    // One model list for the status bar and the panel (Lot P0b).
    const models = getModels(resolved.options);
    void chatView.session.refreshModels(models);
    try {
      await models;
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
    chatView.registration,
    tools.registration,
    vscode.workspace.onDidGrantWorkspaceTrust(() => chatView.session.toolsChanged()),
    vscode.workspace.onDidChangeWorkspaceFolders(() => chatView.session.toolsChanged()),
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
