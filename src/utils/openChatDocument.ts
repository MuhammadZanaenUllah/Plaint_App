import { Linking, Platform } from "react-native";
import { Directory, File as FsFile, Paths } from "expo-file-system";
import {
  EncodingType,
  StorageAccessFramework,
  readAsStringAsync,
  writeAsStringAsync,
} from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library/legacy";
import * as Sharing from "expo-sharing";
import { getStoredToken } from "@/utils/token";
import { resolveFileUrl, resolveSecureFileUrl } from "@/utils/chatHelpers";

/**
 * Opening / downloading chat attachments.
 *
 * Backend files live under `/public/...` and direct static access is disabled
 * (it returns 403 / an Express JSON 404 page), so a remote file cannot be
 * handed to the OS viewer by URL — the viewer would show the backend error.
 * Instead we download the bytes through the auth-gated `secure-file` proxy
 * (with the token headers), write them to the cache, and then open or save the
 * local file. This mirrors the voice-note download path (`downloadPublicAudio`).
 *
 * There is no `expo-media-library` in this project, so "save to device" is
 * implemented through the OS share sheet (`expo-sharing`), which lets the user
 * store the file in Photos, Files, or any other installed app.
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
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  mp4: "video/mp4",
  mov: "video/quicktime",
  m4v: "video/x-m4v",
  avi: "video/x-msvideo",
  mkv: "video/x-matroska",
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  wav: "audio/wav",
};

/** Extension (lowercase, without dot) of a filename or URL path. */
export function attachmentExtension(value?: string | null): string {
  const clean = (value ?? "").split(/[?#]/)[0];
  const part = clean.split("/").pop() ?? "";
  const dot = part.lastIndexOf(".");
  return dot >= 0 ? part.slice(dot + 1).toLowerCase() : "";
}

/**
 * The backend echoes attachment filenames percent-encoded (a multipart
 * filename with non-ASCII characters comes back as e.g. `%D8%AA...pdf`).
 * Decode for display and for deriving the saved file name. Tolerates
 * malformed sequences and one extra encoding pass, and never throws.
 */
export function decodeAttachmentName(name?: string | null): string {
  const value = (name ?? "").trim();
  if (!value || !value.includes("%")) return value;
  let decoded = value;
  for (let i = 0; i < 2; i++) {
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

/** Best-effort MIME type for an attachment name/URL. */
export function getAttachmentMime(nameOrUrl?: string | null): string {
  return MIME_BY_EXT[attachmentExtension(nameOrUrl)] ?? "application/octet-stream";
}

/** Reduce an absolute backend URL to the path the secure proxy expects. */
function toPublicPath(url: string): string {
  if (/^https?:\/\//i.test(url)) {
    try {
      return new URL(url).pathname;
    } catch {
      return url;
    }
  }
  return url;
}

/** Build a filesystem-safe filename, preserving the source extension. */
function safeFileName(
  name: string | null | undefined,
  publicPath: string,
  fallbackPrefix: string,
): string {
  const urlExt = attachmentExtension(publicPath);
  let fileName =
    (name && name.trim()) ||
    publicPath.split("/").pop()?.split("?")[0] ||
    `${fallbackPrefix}-${Date.now()}`;
  // Ensure the local file carries an extension so the OS can identify it.
  if (!attachmentExtension(fileName) && urlExt) {
    fileName = `${fileName}.${urlExt}`;
  }
  // Strip characters that are illegal in a filesystem path.
  return (
    fileName.replace(/[\\/?%*:|"<>]/g, "_").trim() ||
    `${fallbackPrefix}-${Date.now()}`
  );
}

export type LocalAttachment = { uri: string; fileName: string; mime: string };

/**
 * Download a chat attachment into the app cache using the authenticated
 * secure-file proxy (falling back to the direct URL), returning the local file.
 * Already-local URIs are returned as-is.
 */
export async function downloadChatAttachmentToCache(
  rawUrl?: string | null,
  name?: string | null,
): Promise<LocalAttachment | null> {
  const url = (rawUrl ?? "").trim();
  if (!url) return null;

  if (/^(file|content|blob|data):/i.test(url)) {
    return {
      uri: url,
      fileName:
        name?.trim() ||
        url.split("/").pop()?.split("?")[0] ||
        `attachment-${Date.now()}`,
      mime: getAttachmentMime(name || url),
    };
  }

  const publicPath = toPublicPath(url);
  const fileName = safeFileName(name, publicPath, "attachment");
  const mime = getAttachmentMime(name || fileName || publicPath);

  // Web has no file cache / secure headers — hand back the direct URL.
  if (Platform.OS === "web") {
    return { uri: resolveFileUrl(publicPath), fileName, mime };
  }

  const token = await getStoredToken();
  const dir = new Directory(Paths.cache, "downloads");
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
    console.log(
      "[Attachment] secure-file download failed, trying direct:",
      secureErr,
    );
    await FsFile.downloadFileAsync(resolveFileUrl(publicPath), dest, {
      headers,
      idempotent: true,
    });
  }

  return { uri: dest.uri, fileName, mime };
}

/**
 * Save a downloaded image/video directly to the device gallery (Photos /
 * gallery app). Returns false when the user declines permission or the save
 * fails, so the caller can fall back to another method.
 */
async function saveMediaToGallery(localUri: string): Promise<boolean> {
  try {
    // Write-only access is all we need to add an asset.
    const permission = await MediaLibrary.requestPermissionsAsync(true);
    if (!permission.granted) return false;
    await MediaLibrary.saveToLibraryAsync(localUri);
    return true;
  } catch (err) {
    console.log("[Download] Could not save to gallery:", err);
    return false;
  }
}

/**
 * Save a downloaded (non-media) file to a user-chosen folder via Android's
 * Storage Access Framework — the system "Save to folder" sheet, seeded at the
 * public Downloads directory. Returns false if the user cancels or it fails.
 */
async function saveFileWithAndroidPicker(
  localUri: string,
  fileName: string,
  mime: string,
): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  try {
    let initialUri: string | undefined;
    try {
      initialUri = StorageAccessFramework.getUriForDirectoryInRoot("Download");
    } catch {
      initialUri = undefined;
    }
    const permission =
      await StorageAccessFramework.requestDirectoryPermissionsAsync(initialUri);
    if (!permission.granted) return false;
    const targetUri = await StorageAccessFramework.createFileAsync(
      permission.directoryUri,
      fileName,
      mime || "application/octet-stream",
    );
    const base64 = await readAsStringAsync(localUri, {
      encoding: EncodingType.Base64,
    });
    await writeAsStringAsync(targetUri, base64, {
      encoding: EncodingType.Base64,
    });
    return true;
  } catch (err) {
    console.log("[Download] Could not save via folder picker:", err);
    return false;
  }
}

/**
 * Download a chat attachment (photo, video, document, audio) and save it to the
 * device:
 *   - photos & videos → the device gallery (no share sheet),
 *   - documents/audio on Android → the system "Save to folder" sheet,
 *   - documents on iOS / anything that fails → the OS share sheet,
 *   - web → a browser download.
 */
export async function downloadChatAttachment(
  rawUrl?: string | null,
  name?: string | null,
): Promise<void> {
  const url = (rawUrl ?? "").trim();
  if (!url) return;

  if (Platform.OS === "web") {
    const direct = /^(file|content|blob|data):/i.test(url)
      ? url
      : resolveFileUrl(toPublicPath(url));
    if (typeof document !== "undefined") {
      const a = document.createElement("a");
      a.href = direct;
      if (name?.trim()) a.download = name.trim();
      a.target = "_blank";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } else {
      await Linking.openURL(direct).catch(() => {});
    }
    return;
  }

  const local = await downloadChatAttachmentToCache(url, name);
  if (!local) return;

  const isMedia =
    local.mime.startsWith("image/") || local.mime.startsWith("video/");

  if (isMedia && (await saveMediaToGallery(local.uri))) {
    return;
  }

  // Documents/audio on Android: let the user pick where to store the file.
  if (
    Platform.OS === "android" &&
    (await saveFileWithAndroidPicker(local.uri, local.fileName, local.mime))
  ) {
    return;
  }

  // Fallback (iOS documents, denied permissions, unsupported media): the OS
  // share sheet, which includes "Save to Files".
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(local.uri, {
      mimeType: local.mime,
      dialogTitle: `Save ${local.fileName}`,
    });
  } else {
    await Linking.openURL(local.uri);
  }
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

  // Web has no file cache / secure headers — fall back to the direct URL.
  if (Platform.OS === "web") {
    Linking.openURL(resolveFileUrl(toPublicPath(url))).catch(() => {});
    return;
  }

  const local = await downloadChatAttachmentToCache(url, name);
  if (!local) return;

  console.log("[Document] opening local file:", local);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(local.uri, {
      mimeType: local.mime,
      dialogTitle: local.fileName,
    });
  } else {
    await Linking.openURL(local.uri);
  }
}
