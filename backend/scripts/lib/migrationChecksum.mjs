/**
 * Prisma migration checksum helpers.
 *
 * Algorithm source (Prisma engines schema-connector checksum.rs):
 * - SHA-256 over the migration script as a UTF-8 string
 * - Lowercase zero-padded hex (64 chars)
 * - Matching also accepts CRLF/LF variants and legacy non-zero-padded hex
 *
 * Evidence: disposable DB checksums written by Prisma 5.22 match
 * createHash("sha256").update(fileUtf8).digest("hex") for repository SQL files.
 */

import { createHash } from "node:crypto";

const CHECKSUM_STR_LEN = 64;

export function renderChecksum(script) {
  return formatChecksum(computeChecksum(script));
}

export function computeChecksum(script) {
  return createHash("sha256").update(script, "utf8").digest();
}

export function formatChecksum(digest) {
  return Buffer.from(digest).toString("hex");
}

/** Legacy Prisma format without zero-padding (engines issue #1887). */
export function formatChecksumOld(digest) {
  return [...Buffer.from(digest)].map((b) => b.toString(16)).join("");
}

/**
 * Returns true when script matches a stored checksum using Prisma's comparison rules.
 */
export function scriptMatchesChecksum(script, checksum) {
  if (typeof checksum !== "string" || checksum.length === 0) return false;

  const candidates = [
    script,
    script.replace(/\r\n/g, "\n"),
    script.replace(/\n/g, "\r\n"),
  ];

  for (const candidate of candidates) {
    const digest = computeChecksum(candidate);
    const formatted =
      checksum.length !== CHECKSUM_STR_LEN
        ? formatChecksumOld(digest)
        : formatChecksum(digest);
    if (formatted === checksum) return true;
  }
  return false;
}

export function checksumFromFileBytes(utf8Text) {
  return renderChecksum(utf8Text);
}
