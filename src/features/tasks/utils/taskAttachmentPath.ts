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

/** Display name: keep original, else strip everything through the first "-". */
export function attachmentDisplayName(
  originalName: string | null | undefined,
  storedName: string,
): string {
  const original = (originalName ?? "").trim();
  if (original) return original;
  const stored = storedName.split("/").pop() ?? storedName;
  const dash = stored.indexOf("-");
  return dash >= 0 && dash < stored.length - 1 ? stored.slice(dash + 1) : stored;
}
