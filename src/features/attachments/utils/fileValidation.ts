import { ALLOWED_EXTENSIONS, type AllowedExtension } from "../types/attachment.types";

export const isExtensionAllowed = (extension: string): extension is AllowedExtension => {
  return (ALLOWED_EXTENSIONS as readonly string[]).includes(extension.toLowerCase());
};

export const getFileExtension = (fileName: string): string => {
  const idx = fileName.lastIndexOf(".");
  if (idx === -1) return "";
  return fileName.slice(idx + 1).toLowerCase();
};

export const formatFileSize = (bytes: number): string => {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const k = 1024;
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), units.length - 1);
  const value = bytes / Math.pow(k, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};
