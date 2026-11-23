/**
 * The HTML page of the chat panel's webview and its Content Security Policy. Pure apart from the
 * nonce, so the policy is tested without the editor.
 * `default-src 'none'`; the one script only with a fresh nonce; styles, images and fonts only from
 * the webview's own source (the extension's `media` folder); nothing inline, nothing evaluated, no
 * network. The page holds no text: the script builds every element and receives its labels.
 */
import { randomBytes } from "node:crypto";

export interface PageParts {
  /** `webview.cspSource`. */
  cspSource: string;
  nonce: string;
  /** `webview.asWebviewUri` of `media/panel.js` and `media/panel.css`, as strings. */
  scriptUri: string;
  styleUri: string;
}

/** A fresh nonce for one page (128 bits and more, base64 without padding). */
export function newNonce(): string {
  return randomBytes(18).toString("base64").replace(/[+/=]/g, "A");
}

export function contentSecurityPolicy(cspSource: string, nonce: string): string {
  return [
    "default-src 'none'",
    `style-src ${cspSource}`,
    `img-src ${cspSource}`,
    `font-src ${cspSource}`,
    `script-src 'nonce-${nonce}'`,
  ].join("; ");
}

function attribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function panelHtml(parts: PageParts): string {
  const policy = contentSecurityPolicy(parts.cspSource, parts.nonce);
  return [
    "<!DOCTYPE html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="UTF-8">',
    `<meta http-equiv="Content-Security-Policy" content="${attribute(policy)}">`,
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    `<link rel="stylesheet" href="${attribute(parts.styleUri)}">`,
    "</head>",
    "<body>",
    '<div id="app"></div>',
    `<script nonce="${attribute(parts.nonce)}" src="${attribute(parts.scriptUri)}"></script>`,
    "</body>",
    "</html>",
  ].join("\n");
}
