/**
 * The thin VS Code adapter of the chat panel: the webview view, its page, the store's folder in the
 * extension's private storage, the confirmation of a deletion and the remembered model. Everything
 * it calls is tested elsewhere (`session`, `page`, `store`); it holds no logic of its own.
 */
import * as path from "node:path";
import * as vscode from "vscode";
import type { CallRecord } from "./log";
import { PANEL } from "./messages";
import { newNonce, panelHtml } from "./page";
import { ChatSession, type SessionResolution, type SessionWorkspace } from "./session";
import { FileStore, newConversationId } from "./store";

export const VIEW_ID = "assistantCabinetCoder.chat";
const MODEL_KEY = "assistantCabinetCoder.panelModel";

export interface PanelDeps {
  resolve(): Promise<SessionResolution>;
  log(record: CallRecord): void;
  /** The workspace side of the panel's tools (Lot P0b), built by `extension`. */
  workspace?: SessionWorkspace;
}

/** Where the conversations of this window are saved: the workspace's private storage. */
function storeFolder(context: vscode.ExtensionContext): string {
  const base =
    context.storageUri?.fsPath ?? path.join(context.globalStorageUri.fsPath, "no-folder");
  return path.join(base, "conversations");
}

export function registerChatView(
  context: vscode.ExtensionContext,
  deps: PanelDeps,
): { session: ChatSession; registration: vscode.Disposable } {
  let current: vscode.WebviewView | undefined;
  const session = new ChatSession({
    resolve: () => deps.resolve(),
    store: new FileStore(storeFolder(context)),
    post: (message) => {
      void current?.webview.postMessage(message);
    },
    confirmDelete: async (title) =>
      (await vscode.window.showWarningMessage(
        PANEL.deleteConfirm(title),
        { modal: true },
        PANEL.delete,
      )) === PANEL.delete,
    log: (record) => deps.log(record),
    preferredModel: () => context.workspaceState.get<string>(MODEL_KEY),
    rememberModel: (model) => void context.workspaceState.update(MODEL_KEY, model),
    newId: (now) => newConversationId(now),
    clock: () => Date.now(),
    ...(deps.workspace === undefined ? {} : { workspace: deps.workspace }),
  });
  const media = vscode.Uri.joinPath(context.extensionUri, "media");

  const provider: vscode.WebviewViewProvider = {
    resolveWebviewView: (view) => {
      current = view;
      view.webview.options = {
        enableScripts: true,
        enableForms: false,
        enableCommandUris: false,
        localResourceRoots: [media],
      };
      view.webview.html = panelHtml({
        cspSource: view.webview.cspSource,
        nonce: newNonce(),
        scriptUri: view.webview.asWebviewUri(vscode.Uri.joinPath(media, "panel.js")).toString(),
        styleUri: view.webview.asWebviewUri(vscode.Uri.joinPath(media, "panel.css")).toString(),
      });
      const listener = view.webview.onDidReceiveMessage((message: unknown) => {
        void session.receive(message);
      });
      view.onDidDispose(() => {
        listener.dispose();
        if (current === view) {
          current = undefined;
        }
      });
    },
  };

  const registration = vscode.window.registerWebviewViewProvider(VIEW_ID, provider);
  return {
    session,
    registration: vscode.Disposable.from(registration, { dispose: () => session.stop() }),
  };
}
