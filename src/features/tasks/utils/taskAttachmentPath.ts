// Secure-file paths for Task/Project attachments (contract §11.4).
// Task and comment attachments live under public/uploads/notes/; project
// attachments live under public/uploads/projects/.

const EXTERNAL_OR_LOCAL = /^(https?:|file:|content:|blob:|data:)/i;

export type AttachmentFolder = "notes" | "projects";

export function buildAttachmentPublicPath(
  attachment: string | null | undefined,
  folder: AttachmentFolder = "notes",
): string {
  const value = (attachment ?? "").trim();
  if (!value) return "";
  if (EXTERNAL_OR_LOCAL.test(value)) return value;

  const clean = value.replace(/^\/+/, "");
  if (clean.startsWith("public/")) return clean;

  const folderPath = `uploads/${folder}/`;
  if (clean.startsWith(folderPath)) return `public/${clean}`;
  return `public/${folderPath}${clean}`;
}

export function buildTaskAttachmentPath(
  attachment: string | null | undefined,
): string {
  return buildAttachmentPublicPath(attachment, "notes");
}

export function buildProjectAttachmentPath(
  attachment: string | null | undefined,
): string {
  return buildAttachmentPublicPath(attachment, "projects");
}

/**
 * Strictly decode a byte sequence as UTF-8. Returns null when the bytes are
 * not valid UTF-8 so callers can leave the original value untouched.
 */
function decodeUtf8Bytes(bytes: number[]): string | null {
  let result = "";
  for (let i = 0; i < bytes.length; ) {
    const first = bytes[i];
    if (first <= 0x7f) {
      result += String.fromCharCode(first);
      i += 1;
      continue;
    }

    let extraBytes: number;
    let codePoint: number;
    if (first >= 0xc2 && first <= 0xdf) {
      extraBytes = 1;
      codePoint = first & 0x1f;
    } else if (first >= 0xe0 && first <= 0xef) {
      extraBytes = 2;
      codePoint = first & 0x0f;
    } else if (first >= 0xf0 && first <= 0xf4) {
      extraBytes = 3;
      codePoint = first & 0x07;
    } else {
      return null;
    }

    if (i + extraBytes >= bytes.length) return null;
    for (let j = 1; j <= extraBytes; j += 1) {
      const next = bytes[i + j];
      if ((next & 0xc0) !== 0x80) return null;
      codePoint = (codePoint << 6) | (next & 0x3f);
    }

    if (
      codePoint > 0x10ffff ||
      (codePoint >= 0xd800 && codePoint <= 0xdfff) ||
      (extraBytes === 1 && codePoint < 0x80) ||
      (extraBytes === 2 && codePoint < 0x800) ||
      (extraBytes === 3 && codePoint < 0x10000)
    ) {
      return null;
    }

    result += String.fromCodePoint(codePoint);
    i += extraBytes + 1;
  }
  return result;
}

// UTF-8 bytes decoded as Windows-1252 often surface as these printable code
// points (rather than the raw C1 control characters from Latin-1).
const CP1252_BYTES: Record<number, number> = {
  0x20ac: 0x80,
  0x201a: 0x82,
  0x0192: 0x83,
  0x201e: 0x84,
  0x2026: 0x85,
  0x2020: 0x86,
  0x2021: 0x87,
  0x02c6: 0x88,
  0x2030: 0x89,
  0x0160: 0x8a,
  0x2039: 0x8b,
  0x0152: 0x8c,
  0x017d: 0x8e,
  0x2018: 0x91,
  0x2019: 0x92,
  0x201c: 0x93,
  0x201d: 0x94,
  0x2022: 0x95,
  0x2013: 0x96,
  0x2014: 0x97,
  0x02dc: 0x98,
  0x2122: 0x99,
  0x0161: 0x9a,
  0x203a: 0x9b,
  0x0153: 0x9c,
  0x017e: 0x9e,
  0x0178: 0x9f,
};

/**
 * Repair UTF-8 text that was mistakenly decoded as Latin-1/Windows-1252 by a
 * multipart parser (e.g. `ØªÙ‚Ø±ÙŠØ±.pdf` -> `تقرير.pdf`). Only converts when
 * every code unit maps back to a byte and the resulting bytes are valid UTF-8.
 */
function repairMojibake(value: string): string {
  let current = value;
  for (let pass = 0; pass < 2; pass += 1) {
    const bytes: number[] = [];
    let canBeSingleByteText = true;
    let hasHighByte = false;
    for (let i = 0; i < current.length; i += 1) {
      const code = current.charCodeAt(i);
      const byte = code <= 0xff ? code : CP1252_BYTES[code];
      if (byte === undefined) {
        canBeSingleByteText = false;
        break;
      }
      if (byte >= 0x80) hasHighByte = true;
      bytes.push(byte);
    }
    if (!canBeSingleByteText || !hasHighByte) break;

    const decoded = decodeUtf8Bytes(bytes);
    if (!decoded || decoded === current) break;

    let hasNonAscii = false;
    for (let i = 0; i < decoded.length; i += 1) {
      if (decoded.charCodeAt(i) > 0x7f) {
        hasNonAscii = true;
        break;
      }
    }
    if (!hasNonAscii) break;
    current = decoded;
  }
  return current;
}

function decodePercentEncoding(value: string): string {
  if (!value.includes("%")) return value;
  let decoded = value;
  for (let i = 0; i < 2; i += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }
  return decoded;
}

/**
 * Normalise a server-echoed attachment filename for display. Handles both
 * percent-encoded names and UTF-8-as-Latin-1 mojibake while leaving plain
 * ASCII and already-valid Unicode names untouched.
 */
export function normalizeAttachmentName(name?: string | null): string {
  const value = (name ?? "").trim();
  if (!value) return value;
  return repairMojibake(decodePercentEncoding(value));
}

/** Display name: keep original, else strip everything through the first "-". */
export function attachmentDisplayName(
  originalName: string | null | undefined,
  storedName: string,
): string {
  const original = (originalName ?? "").trim();
  if (original) return normalizeAttachmentName(original);
  const stored = storedName.split("/").pop() ?? storedName;
  const dash = stored.indexOf("-");
  const candidate =
    dash >= 0 && dash < stored.length - 1 ? stored.slice(dash + 1) : stored;
  return normalizeAttachmentName(candidate);
}
