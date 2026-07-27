export type AllowedExtension =
  | "png" | "jpg" | "jpeg" | "pdf"
  | "doc" | "docx" | "csv" | "txt"
  | "zip" | "rar" | "sql" | "ppt"
  | "xls" | "xlsx" | "svg" | "webp"
  | "avif";

export const ALLOWED_EXTENSIONS: readonly AllowedExtension[] = [
  "png", "jpg", "jpeg", "pdf",
  "doc", "docx", "csv", "txt",
  "zip", "rar", "sql", "ppt",
  "xls", "xlsx", "svg", "webp",
  "avif",
];

export type SelectedFile = {
  name: string;
  uri: string;
  mimeType: string;
  size: number;
  extension: string;
};
