/**
 * `npm run stub`: starts the stub gateway for a demonstration.
 *
 *   npm run stub -- --mode ok|version-mismatch|off|key-needed|oversize|redirect
 *                   [--port 8099] [--key SECRET] [--https FOLDER]
 *
 * With `--https FOLDER` the stub speaks HTTPS with a throw-away authority and writes the public
 * authority file to `FOLDER/ca.pem` (the certificate names are localhost and 127.0.0.1).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { parseArgs } from "node:util";
import { createAuthority, issueServerCertificate } from "../support/pki";
import { STUB_MODES, startStub, type StubMode, type StubOptions } from "./stub";

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      mode: { type: "string", default: "ok" },
      port: { type: "string", default: "8099" },
      key: { type: "string" },
      https: { type: "string" },
    },
  });
  const mode = values.mode as StubMode;
  if (!STUB_MODES.includes(mode)) {
    throw new Error(`Unknown mode "${mode}". Modes: ${STUB_MODES.join(", ")}.`);
  }
  const options: StubOptions = { mode };
  if (values.key !== undefined) {
    options.requireKey = values.key;
  }
  let authorityFile: string | undefined;
  if (values.https !== undefined) {
    const authority = createAuthority();
    const server = issueServerCertificate(authority, { dns: ["localhost"], ips: ["127.0.0.1"] });
    options.tls = { key: server.keyPem, cert: server.certPem };
    mkdirSync(values.https, { recursive: true });
    authorityFile = path.join(values.https, "ca.pem");
    writeFileSync(authorityFile, authority.certPem);
  }
  const stub = await startStub(options, Number(values.port));
  console.log(`Stub gateway listening on ${stub.url} (mode: ${mode}).`);
  if (authorityFile !== undefined) {
    console.log(`Authority file written to: ${authorityFile}`);
  }
  if (values.key !== undefined) {
    console.log("A bearer key is required on /ide/ requests.");
  }
  console.log("Press Ctrl+C to stop.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
