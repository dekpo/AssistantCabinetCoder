// THROW-AWAY SPIKE of Lot X0. Deleted at the end of Lot X1b. It logs structure only, never text.
import * as vscode from "vscode";
import { makePng16 } from "./png";
import { pickReply } from "./script";
import { describeMessage, hasToolResult, joinedText, names, textChars } from "./structure";

const VENDOR = "cabinetspike";
const GATED_KEY = "cabinetSpike.gated";

const MODELS: vscode.LanguageModelChatInformation[] = [
  {
    id: "spike-tools",
    name: "Spike Tools Model",
    family: "cabinetspike",
    version: "1",
    maxInputTokens: 32768,
    maxOutputTokens: 4096,
    tooltip: "Throw-away probe model with tool calling and image input",
    capabilities: { toolCalling: true, imageInput: true },
  },
  {
    id: "spike-plain",
    name: "Spike Plain Model",
    family: "cabinetspike",
    version: "1",
    maxInputTokens: 32768,
    maxOutputTokens: 4096,
    tooltip: "Throw-away probe model without tool calling or image input",
    capabilities: { toolCalling: false, imageInput: false },
  },
];

let channel: vscode.OutputChannel;
let gated = false;

function log(line: string): void {
  channel.appendLine(`${new Date().toISOString()} ${line}`);
}

function logEnvironment(context: vscode.ExtensionContext): void {
  const self = vscode.extensions.getExtension(context.extension.id);
  const kind = self ? vscode.ExtensionKind[self.extensionKind] : "unknown";
  log(
    `env vscode=${vscode.version} app=${vscode.env.appName} remoteName=${vscode.env.remoteName ?? "none"} ` +
      `uiKind=${vscode.UIKind[vscode.env.uiKind]} extensionKind=${kind} platform=${process.platform} ` +
      `telemetryEnabled=${vscode.env.isTelemetryEnabled}`,
  );
}

function logSetting(): void {
  const info = vscode.workspace.getConfiguration("cabinetSpike").inspect<string>("machineSetting");
  log(
    `setting machineSetting effective=${JSON.stringify(
      vscode.workspace.getConfiguration("cabinetSpike").get("machineSetting"),
    )} user=${JSON.stringify(info?.globalValue)} workspace=${JSON.stringify(info?.workspaceValue)} ` +
      `workspaceFolder=${JSON.stringify(info?.workspaceFolderValue)}`,
  );
}

function logTools(): void {
  log(`lm.tools count=${vscode.lm.tools.length} names=[${names(vscode.lm.tools)}]`);
}

class SpikeProvider implements vscode.LanguageModelChatProvider {
  provideLanguageModelChatInformation(
    options: vscode.PrepareLanguageModelChatModelOptions,
  ): vscode.LanguageModelChatInformation[] {
    log(`provideLanguageModelChatInformation silent=${options.silent} models=${MODELS.length}`);
    return MODELS;
  }

  async provideLanguageModelChatResponse(
    model: vscode.LanguageModelChatInformation,
    messages: readonly vscode.LanguageModelChatRequestMessage[],
    options: vscode.ProvideLanguageModelChatResponseOptions,
    progress: vscode.Progress<vscode.LanguageModelResponsePart>,
    token: vscode.CancellationToken,
  ): Promise<void> {
    const tools = options.tools ?? [];
    log(
      `request model=${model.id} messages=${messages.length} ` +
        `firstMessageChars=${messages[0] ? textChars(messages[0].content) : 0} ` +
        `toolMode=${vscode.LanguageModelChatToolMode[options.toolMode]} tools=${tools.length} ` +
        `modelOptionsKeys=[${Object.keys(options.modelOptions ?? {}).join(", ")}]`,
    );
    log(`  options.tools names=[${names(tools)}]`);
    messages.forEach((m, i) => {
      log(`  ${describeMessage(i, vscode.LanguageModelChatMessageRole[m.role], m.content)}`);
    });
    logTools();

    const last = messages[messages.length - 1];
    const reply = pickReply({
      tools,
      lastIsToolResult: last ? hasToolResult(last.content) : false,
      lastUserText: last ? joinedText(last.content) : "",
    });
    if (token.isCancellationRequested) {
      return;
    }
    if (reply.kind === "toolCall") {
      log(`  reply toolCall name=${reply.name}`);
      progress.report(
        new vscode.LanguageModelToolCallPart(`spike-call-${Date.now()}`, reply.name, reply.input),
      );
    } else {
      log(`  reply text chars=${reply.text.length}`);
      progress.report(new vscode.LanguageModelTextPart(reply.text));
    }
  }

  provideTokenCount(
    _model: vscode.LanguageModelChatInformation,
    text: string | vscode.LanguageModelChatRequestMessage,
  ): Promise<number> {
    const chars = typeof text === "string" ? text.length : textChars(text.content);
    return Promise.resolve(Math.max(1, Math.ceil(chars / 4)));
  }
}

export function activate(context: vscode.ExtensionContext): void {
  channel = vscode.window.createOutputChannel("Cabinet Spike");
  context.subscriptions.push(channel);
  log("activate");
  logEnvironment(context);

  void vscode.commands.executeCommand("setContext", GATED_KEY, gated);

  context.subscriptions.push(
    vscode.lm.registerLanguageModelChatProvider(VENDOR, new SpikeProvider()),

    vscode.lm.registerTool("spike_image", {
      invoke() {
        log("tool spike_image invoked");
        return new vscode.LanguageModelToolResult([
          vscode.LanguageModelDataPart.image(makePng16(), "image/png"),
        ]);
      },
    }),

    vscode.lm.registerTool("spike_gated", {
      invoke() {
        log("tool spike_gated invoked");
        return new vscode.LanguageModelToolResult([
          new vscode.LanguageModelTextPart("Spike gated tool ran."),
        ]);
      },
    }),

    vscode.commands.registerCommand("cabinetSpike.toggleGated", async () => {
      gated = !gated;
      await vscode.commands.executeCommand("setContext", GATED_KEY, gated);
      log(`context key ${GATED_KEY}=${gated}`);
      void vscode.window.showInformationMessage(`Spike: ${GATED_KEY} is now ${gated}`);
    }),

    vscode.commands.registerCommand("cabinetSpike.logInfo", () => {
      logEnvironment(context);
      logSetting();
      logTools();
      channel.show(true);
    }),
  );
}

export function deactivate(): void {}
