import { Linking, Platform } from "react-native";
import { Directory, File as FsFile, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { getStoredToken } from "@/utils/token";
import { resolveFileUrl, resolveSecureFileUrl } from "@/utils/chatHelpers";

/**
 * Open a chat document/PDF attachment.
 *
 * Backend files live under `/public/...` and direct static access is disabled
 * (it returns 403 / an Express JSON 404 page), so a remote document cannot be
 * handed to the OS viewer by URL — the viewer would show the backend error.
 * Instead we download the bytes through the auth-gated `secure-file` proxy
 * (with the token headers), write them to the cache, and then open the local
 * file. This mirrors the voice-note download path (`downloadPublicAudio`).
 */

const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  rtf: "application/rtf",
  csv: "text/csv",
  json: "application/json",
  xml: "application/xml",
  zip: "application/zip",
  rar: "application/vnd.rar",
  "7z": "application/x-7z-compressed",
  pages: "application/vnd.apple.pages",
  numbers: "application/vnd.apple.numbers",
  key: "application/vnd.apple.keynote",
};

/** Extension (lowercase, without dot) of a filename or URL path. */
export function attachmentExtension(value?: string | null): string {
  const clean = (value ?? "").split(/[?#]/)[0];
  const part = clean.split("/").pop() ?? "";
  const dot = part.lastIndexOf(".");
  return dot >= 0 ? part.slice(dot + 1).toLowerCase() : "";
}

/** Best-effort MIME type for an attachment name/URL. */
export function getAttachmentMime(nameOrUrl?: string | null): string {
  return MIME_BY_EXT[attachmentExtension(nameOrUrl)] ?? "application/octet-stream";
}

export async function openChatDocument(
  rawUrl?: string | null,
  name?: string | null,
): Promise<void> {
  const url = (rawUrl ?? "").trim();
  if (!url) return;

  // Already-local files: hand straight to the OS. Android can't expose a
  // file:// URI directly, so share it (that grants the receiving app access).
  if (/^(file|content|blob|data):/i.test(url)) {
    if (Platform.OS === "android") {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(url);
        return;
      }
    }
    await Linking.openURL(url);
    return;
  }

  // Remote: reduce an absolute backend URL to its path so the secure proxy
  // receives `p=public/<path>` rather than the whole URL.
  let publicPath = url;
  if (/^https?:\/\//i.test(url)) {
    try {
      publicPath = new URL(url).pathname;
    } catch {
      publicPath = url;
    }
  }

  const urlExt = attachmentExtension(publicPath);
  let fileName =
    (name && name.trim()) ||
    publicPath.split("/").pop()?.split("?")[0] ||
    `document-${Date.now()}`;
  // Ensure the local file carries an extension so the viewer can identify it.
  if (!attachmentExtension(fileName) && urlExt) {
    fileName = `${fileName}.${urlExt}`;
  }
  // Strip characters that are illegal in a filesystem path.
  fileName = fileName.replace(/[\\/?%*:|"<>]/g, "_").trim() || `document-${Date.now()}`;
  const mime = getAttachmentMime(name || fileName || publicPath);

  // Web has no file cache / secure headers — fall back to the direct URL.
  if (Platform.OS === "web") {
    Linking.openURL(resolveFileUrl(publicPath)).catch(() => {});
    return;
  }

  const token = await getStoredToken();
  const dir = new Directory(Paths.cache, "documents");
  try {
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  } catch {
    // Ignore — download below will surface any real failure.
  }

  const dest = new FsFile(dir, fileName);
  try {
    if (dest.exists) dest.delete();
  } catch {
    // Ignore a stale/undeletable file; download is idempotent.
  }

  const headers: Record<string, string> = {};
  if (token) {
    headers.authToken = token;
    headers["x-access-token"] = token;
  }

  try {
    await FsFile.downloadFileAsync(resolveSecureFileUrl(publicPath), dest, {
      headers,
      idempotent: true,
    });
  } catch (secureErr) {
    console.log("[Document] secure-file download failed, trying direct:", secureErr);
    await FsFile.downloadFileAsync(resolveFileUrl(publicPath), dest, {
      headers,
      idempotent: true,
    });
  }

  console.log("[Document] opening local file:", {
    uri: dest.uri,
    exists: dest.exists,
    size: dest.size,
    mime,
  });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(dest.uri, {
      mimeType: mime,
      dialogTitle: fileName,
    });
  } else {
    await Linking.openURL(dest.uri);
  }
}
