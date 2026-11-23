/**
 * The HTML page of the chat panel's webview and its Content Security Policy. Pure apart from the
 * nonce, so the policy is tested without the editor.
 * `default-src 'none'`; the one script only with a fresh nonce; styles, images and fonts only from
 * the webview's own source (the extension's `media` folder); nothing inline, nothing evaluated, no
 * network. The page holds no text: the script builds every element and receives its labels.
 * The panel's few icons are drawn here once, inside a hidden element, and the script copies them:
 * they take the theme's colour (`currentColor`) and need no file, font or address.
 */
import { randomBytes } from "node:crypto";

/**
 * The panel's icons, 16 by 16, drawn for this extension: one filled path each.
 * `send` an arrow up, `stop` a square, `new` a plus, `history` a clock, `back` an arrow left,
 * `delete` a bin.
 */
export const ICONS: Readonly<Record<string, string>> = {
  send: "M8 2.3 3.2 7.1l.9.9 3.3-3.3V13.6h1.2V4.7l3.3 3.3.9-.9z",
  stop: "M4 4h8v8H4z",
  new: "M7.4 2h1.2v5.4H14v1.2H8.6V14H7.4V8.6H2V7.4h5.4z",
  history:
    "M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zm0 1.2a5.3 5.3 0 1 1 0 10.6 5.3 5.3 0 0 1 0-10.6zM7.4 4.2v4.2l2.9 2.1.7-1-2.4-1.7V4.2z",
  back: "M7.1 3.2 2.3 8l4.8 4.8.9-.9-3.3-3.3h8.9V7.4H4.7L8 4.1z",
  delete:
    "M6 1.8h4V3h3.2v1.2H2.8V3H6zM4 5h1.2v8h5.6V5H12v9.2H4zm2.2 1.2h1.1v5.6H6.2zm2.5 0h1.1v5.6H8.7z",
};

function iconMarkup(): string {
  return Object.entries(ICONS)
    .map(
      ([name, path]) =>
        `<svg data-icon="${name}" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path fill="currentColor" fill-rule="evenodd" d="${path}"/></svg>`,
    )
    .join("");
}

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
    `<div id="icons" hidden>${iconMarkup()}</div>`,
    '<div id="app"></div>',
    `<script nonce="${attribute(parts.nonce)}" src="${attribute(parts.scriptUri)}"></script>`,
    "</body>",
    "</html>",
  ].join("\n");
}
