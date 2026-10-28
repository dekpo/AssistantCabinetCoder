import type { ClientOptions } from "../../src/client";
import type { CallRecord } from "../../src/log";
import type { Host, Resolution } from "../../src/provider";

/** A `Host` that records what the provider shows, logs and fires, and answers from the test. */
export class FakeHost implements Host {
  readonly shown: { text: string; offerKey: boolean }[] = [];
  readonly logs: CallRecord[] = [];
  changes = 0;
  resolutions = 0;
  /** What `resolve` answers; the cache is keyed by `url`, the server really called is `target`. */
  url = "http://server.test";
  nextFailure: Resolution | undefined;

  constructor(
    public target: string,
    public extra: Partial<ClientOptions> = {},
  ) {}

  resolve(): Promise<Resolution> {
    this.resolutions += 1;
    if (this.nextFailure !== undefined) {
      return Promise.resolve(this.nextFailure);
    }
    return Promise.resolve({
      ok: true,
      url: this.url,
      options: { baseUrl: this.target, timeoutSeconds: 5, ...this.extra },
    });
  }

  show(text: string, offerKey = false): void {
    this.shown.push({ text, offerKey });
  }

  log(record: CallRecord): void {
    this.logs.push(record);
  }

  fireChange(): void {
    this.changes += 1;
  }
}
