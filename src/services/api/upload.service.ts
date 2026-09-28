import { getStoredToken } from "@/utils/token";

const BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  "https://backend-planit.soulservices.com/api/v1";

export type UploadProgress = {
  loaded: number;
  total: number;
  percentage: number;
};

export type UploadOptions = {
  onProgress?: (progress: UploadProgress) => void;
  onError?: (error: Error) => void;
  onComplete?: (response: unknown) => void;
  onAbort?: () => void;
};

/**
 * Upload a file with progress tracking using XMLHttpRequest.
 * Returns an abort controller to cancel the upload.
 */
export function uploadWithProgress(
  path: string,
  formData: FormData,
  options: UploadOptions = {}
): { abort: () => void } {
  const { onProgress, onError, onComplete } = options;

  const xhr = new XMLHttpRequest();

  xhr.upload.addEventListener("progress", (event) => {
    if (event.lengthComputable && onProgress) {
      // Some environments report `loaded`/`total` such that the raw value can
      // exceed 100; cap the displayed progress to a normal 0–100 range.
      const percentage = Math.min(
        100,
        Math.round((event.loaded / event.total) * 100),
      );
      onProgress({
        loaded: event.loaded,
        total: event.total,
        percentage,
      });
    }
  });

  xhr.addEventListener("load", () => {
    try {
      const response = JSON.parse(xhr.responseText);
      if (xhr.status >= 200 && xhr.status < 300) {
        onComplete?.(response);
      } else {
        onError?.(new Error(response.message || `Upload failed (${xhr.status})`));
      }
    } catch {
      onError?.(new Error("Failed to parse upload response"));
    }
  });

  xhr.addEventListener("error", () => {
    onError?.(new Error("Network error during upload"));
  });

  xhr.addEventListener("abort", () => {
    options.onAbort?.();
  });

  xhr.open("POST", `${BASE_URL}${path}`);

  // Add auth headers
  getStoredToken().then((token) => {
    if (token) {
      xhr.setRequestHeader("x-access-token", token);
      xhr.setRequestHeader("authToken", token);
    }
    xhr.send(formData);
  });

  return {
    abort: () => {
      xhr.abort();
    },
  };
}

/**
 * Validate files before upload.
 * Returns validation errors or null if all files are valid.
 */
export function validateFiles(
  files: Array<{ name: string; size?: number; type?: string }>
): string[] {
  const errors: string[] = [];
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
  const MAX_FILES = 20;

  if (files.length > MAX_FILES) {
    errors.push(`Maximum ${MAX_FILES} files allowed per message`);
  }

  for (const file of files) {
    if (file.size && file.size > MAX_FILE_SIZE) {
      const sizeMB = Math.round(file.size / (1024 * 1024));
      errors.push(`"${file.name}" is ${sizeMB}MB (max 10MB)`);
    }
  }

  return errors;
}

/**
 * Format file size for display.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
