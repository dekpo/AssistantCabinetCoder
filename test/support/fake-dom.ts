/**
 * The smallest document the chat panel's script needs, so `media/panel.js` runs in plain Node:
 * elements with children, text, classes, a few properties and listeners. It has no HTML parser at
 * all, so a test can prove that the script never asks for one.
 */
import { ICONS, TOOL_ICONS } from "../../src/page";

export class FakeText {
  readonly nodeType = 3;
  parent: FakeElement | undefined;
  constructor(public text: string) {}
  get textContent(): string {
    return this.text;
  }
}

type Node = FakeElement | FakeText;

export class FakeElement {
  readonly nodeType = 1;
  readonly tagName: string;
  children: Node[] = [];
  parent: FakeElement | undefined;
  className = "";
  hidden = false;
  disabled = false;
  value = "";
  title = "";
  placeholder = "";
  rows = 0;
  start = 1;
  selected = false;
  id = "";
  scrollTop = 0;
  scrollHeight = 100;
  clientHeight = 100;
  iconName: string | undefined;
  focused = false;
  readonly style: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, ((event: unknown) => void)[]>();
  readonly classList = {
    toggle: (name: string, force?: boolean): void => {
      const names = new Set(this.className.split(" ").filter((part) => part !== ""));
      if (force ?? !names.has(name)) {
        names.add(name);
      } else {
        names.delete(name);
      }
      this.className = [...names].join(" ");
    },
  };

  constructor(tag: string) {
    this.tagName = tag.toUpperCase();
  }

  get textContent(): string {
    return this.children.map((child) => child.textContent).join("");
  }

  set textContent(text: string) {
    this.children = [];
    if (text !== "") {
      this.append(new FakeText(text));
    }
  }

  append(...nodes: Node[]): void {
    for (const node of nodes) {
      node.parent = this;
      this.children.push(node);
    }
  }

  replaceChildren(...nodes: Node[]): void {
    this.children = [];
    this.append(...nodes);
  }

  replaceWith(node: Node): void {
    const parent = this.parent;
    if (parent === undefined) {
      return;
    }
    const index = parent.children.indexOf(this);
    node.parent = parent;
    parent.children[index] = node;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, String(value));
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  focus(): void {
    this.focused = true;
  }

  /** A deep copy (the script copies the page's icons). */
  cloneNode(deep: boolean): FakeElement {
    const copy = new FakeElement(this.tagName);
    copy.className = this.className;
    for (const [name, value] of this.attributes) {
      copy.attributes.set(name, value);
    }
    if (deep) {
      copy.append(
        ...this.children.map((child) =>
          child instanceof FakeElement ? child.cloneNode(true) : new FakeText(child.text),
        ),
      );
    }
    return copy;
  }

  addEventListener(type: string, listener: (event: unknown) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  dispatch(type: string, event: Record<string, unknown> = {}): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener({ preventDefault: () => undefined, ...event });
    }
  }

  /** Every element below this one, depth first. */
  descendants(): FakeElement[] {
    return this.children.flatMap((child) =>
      child instanceof FakeElement ? [child, ...child.descendants()] : [],
    );
  }

  find(predicate: (element: FakeElement) => boolean): FakeElement | undefined {
    return this.descendants().find(predicate);
  }

  byClass(name: string): FakeElement[] {
    return this.descendants().filter((element) => element.className.split(" ").includes(name));
  }
}

export interface FakeWindow {
  app: FakeElement;
  posted: unknown[];
  created: string[];
  /** Sends a message to the script, as the extension does. */
  receive(message: unknown): void;
  sandbox: Record<string, unknown>;
}

export function fakeWindow(): FakeWindow {
  const app = new FakeElement("div");
  app.id = "app";
  // The page's hidden icons, as src/page.ts draws them (one per name).
  const icons = new FakeElement("div");
  icons.id = "icons";
  icons.hidden = true;
  for (const name of Object.keys(ICONS)) {
    const svg = new FakeElement("svg");
    svg.setAttribute("data-icon", name);
    icons.append(svg);
  }
  // The tools' icons of Lot P0b, in their own hidden element.
  const toolIcons = new FakeElement("div");
  toolIcons.id = "tool-icons";
  toolIcons.hidden = true;
  for (const name of Object.keys(TOOL_ICONS)) {
    const svg = new FakeElement("svg");
    svg.setAttribute("data-icon", name);
    toolIcons.append(svg);
  }
  const posted: unknown[] = [];
  const created: string[] = [];
  const windowListeners: ((event: unknown) => void)[] = [];
  const document = {
    getElementById: (id: string) =>
      id === "app" ? app : id === "icons" ? icons : id === "tool-icons" ? toolIcons : null,
    createElement: (tag: string) => {
      created.push(tag);
      return new FakeElement(tag);
    },
    createTextNode: (text: string) => new FakeText(text),
  };
  const sandbox: Record<string, unknown> = {
    // A copy, as the real postMessage makes one (and an object of this realm, for deepEqual).
    acquireVsCodeApi: () => ({
      postMessage: (message: unknown) => posted.push(JSON.parse(JSON.stringify(message))),
    }),
    document,
    window: {
      addEventListener: (type: string, listener: (event: unknown) => void) => {
        if (type === "message") {
          windowListeners.push(listener);
        }
      },
    },
    // Timers that never keep the test process alive.
    setTimeout: (callback: () => void, ms: number) => setTimeout(callback, ms).unref(),
    clearTimeout,
    setInterval: (callback: () => void, ms: number) => setInterval(callback, ms).unref(),
    clearInterval,
    Date,
    Math,
    Number,
    String,
  };
  return {
    app,
    posted,
    created,
    sandbox,
    receive: (message: unknown) => {
      for (const listener of windowListeners) {
        listener({ data: message });
      }
    },
  };
}
