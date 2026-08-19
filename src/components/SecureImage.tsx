import { useEffect, useMemo, useState } from "react";
import { Image, ImageProps } from "react-native";
import { getStoredToken } from "@/utils/token";
import { resolveFileUrl, resolveSecureFileUrl } from "@/utils/chatHelpers";

type Props = Omit<ImageProps, "source"> & {
  /** A `/public/...`-relative path, bare filename, or already-absolute URL. */
  url: string | null | undefined;
};

/**
 * Renders a backend-hosted file (chat image attachments, etc.). Direct
 * static access to `/public/...` is disabled on the backend — every file
 * must be fetched through the authenticated `secure-file` proxy
 * (IMAGE_AND_AUDIO_HANDLING.md §1, §4), so this tries that proxy with the
 * auth token first and falls back to the direct URL (works only where
 * static serving happens to be open, e.g. some local dev setups).
 */
export default function SecureImage({ url, ...rest }: Props) {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    getStoredToken().then(setToken);
  }, []);

  const candidates = useMemo(() => {
    if (!url) return [];
    const headers = token ? { authToken: token, "x-access-token": token } : undefined;
    return [
      { uri: resolveSecureFileUrl(url), headers },
      { uri: resolveFileUrl(url) },
    ];
  }, [url, token]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [candidates]);

  if (candidates.length === 0) return null;

  const current = candidates[Math.min(index, candidates.length - 1)];

  return (
    <Image
      {...rest}
      source={current}
      onError={(e) => {
        console.log(
          `[SecureImage] Candidate ${index + 1}/${candidates.length} failed for url="${url}": ` +
            `${current?.uri} — ${e.nativeEvent?.error ?? "unknown error"}`
        );
        setIndex((i) => (i < candidates.length - 1 ? i + 1 : i));
      }}
      onLoad={() => {
        console.log(`[SecureImage] Loaded successfully for url="${url}": ${current?.uri}`);
      }}
    />
  );
}
