/**
 * A throw-away certificate authority for the tests, built with `node:crypto` alone (Node cannot
 * issue certificates, and the tests must not depend on OpenSSL being installed). ECDSA P-256,
 * hand-written DER. Test and demo use only: nothing here is ever shipped or stored.
 */
import * as crypto from "node:crypto";

function der(tag: number, ...parts: Buffer[]): Buffer {
  const body = Buffer.concat(parts);
  let header: Buffer;
  if (body.length < 0x80) {
    header = Buffer.from([tag, body.length]);
  } else if (body.length < 0x100) {
    header = Buffer.from([tag, 0x81, body.length]);
  } else {
    header = Buffer.from([tag, 0x82, body.length >> 8, body.length & 0xff]);
  }
  return Buffer.concat([header, body]);
}

function oid(dotted: string): Buffer {
  const numbers = dotted.split(".").map(Number);
  const [first = 0, second = 0, ...rest] = numbers;
  const bytes: number[] = [first * 40 + second];
  for (const value of rest) {
    const chunk: number[] = [value & 0x7f];
    for (let remaining = value >> 7; remaining > 0; remaining >>= 7) {
      chunk.unshift((remaining & 0x7f) | 0x80);
    }
    bytes.push(...chunk);
  }
  return der(0x06, Buffer.from(bytes));
}

function name(commonName: string): Buffer {
  return der(
    0x30,
    der(0x31, der(0x30, oid("2.5.4.3"), der(0x0c, Buffer.from(commonName, "utf8")))),
  );
}

function utcTime(date: Date): Buffer {
  const text = date.toISOString().replace(/[-:T]/g, "").slice(2, 14) + "Z";
  return der(0x17, Buffer.from(text, "ascii"));
}

function extension(id: string, critical: boolean, value: Buffer): Buffer {
  return der(
    0x30,
    oid(id),
    ...(critical ? [der(0x01, Buffer.from([0xff]))] : []),
    der(0x04, value),
  );
}

function toPem(label: string, body: Buffer): string {
  const lines = body.toString("base64").match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`;
}

const ECDSA_SHA256 = der(0x30, oid("1.2.840.10045.4.3.2"));

interface Subject {
  commonName: string;
  spki: Buffer;
}

function certificate(
  issuerName: string,
  subject: Subject,
  extensions: Buffer[],
  signer: crypto.KeyObject,
): Buffer {
  const serial = crypto.randomBytes(8);
  serial[0] = (serial[0] ?? 1) & 0x7f || 1;
  const now = Date.now();
  const tbs = der(
    0x30,
    der(0xa0, der(0x02, Buffer.from([2]))),
    der(0x02, serial),
    ECDSA_SHA256,
    name(issuerName),
    der(0x30, utcTime(new Date(now - 86_400_000)), utcTime(new Date(now + 86_400_000))),
    name(subject.commonName),
    subject.spki,
    der(0xa3, der(0x30, ...extensions)),
  );
  const signature = crypto.sign("sha256", tbs, signer);
  return der(0x30, tbs, ECDSA_SHA256, der(0x03, Buffer.concat([Buffer.from([0]), signature])));
}

function spkiOf(key: crypto.KeyObject): Buffer {
  return key.export({ type: "spki", format: "der" });
}

export interface Authority {
  commonName: string;
  /** The public certificate, the content of a `ca.pem`. */
  certPem: string;
  privateKey: crypto.KeyObject;
}

export function createAuthority(commonName = "Test Authority"): Authority {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
  const der_ = certificate(
    commonName,
    { commonName, spki: spkiOf(publicKey) },
    [
      extension("2.5.29.19", true, der(0x30, der(0x01, Buffer.from([0xff])))),
      extension("2.5.29.15", true, der(0x03, Buffer.from([0x02, 0x04]))),
    ],
    privateKey,
  );
  return { commonName, certPem: toPem("CERTIFICATE", der_), privateKey };
}

export interface ServerCertificate {
  certPem: string;
  keyPem: string;
}

/** A server certificate signed by `authority`, valid for the given host names and IPv4 addresses. */
export function issueServerCertificate(
  authority: Authority,
  names: { dns?: string[]; ips?: string[] },
): ServerCertificate {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
  const general = [
    ...(names.dns ?? []).map((host) => der(0x82, Buffer.from(host, "ascii"))),
    ...(names.ips ?? []).map((ip) => der(0x87, Buffer.from(ip.split(".").map(Number)))),
  ];
  const der_ = certificate(
    authority.commonName,
    { commonName: "Test Server", spki: spkiOf(publicKey) },
    [
      extension("2.5.29.17", false, der(0x30, ...general)),
      extension("2.5.29.19", true, der(0x30)),
      extension("2.5.29.15", true, der(0x03, Buffer.from([0x07, 0x80]))),
    ],
    authority.privateKey,
  );
  return {
    certPem: toPem("CERTIFICATE", der_),
    keyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
}

/** A PEM holding a private key, as a file a user might choose by mistake. */
export function privateKeyPem(authority: Authority): string {
  return authority.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
}
