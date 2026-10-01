import { useEffect, useMemo, useState } from "react";
import { Image, ImageProps, View } from "react-native";
import { resolveFileUrl, resolveSecureFileUrl } from "@/utils/chatHelpers";
import {
  getCachedImageUri,
  resolveImageUri,
  useAuthToken,
} from "@/utils/secureImageFetch";

type Props = Omit<ImageProps, "source"> & {
  /** A `/public/...`-relative path, bare filename, or already-absolute URL. */
  url: string | null | undefined;
};

/**
 * Renders a backend-hosted file (chat image attachments, etc.). Direct
 * static access to `/public/...` is disabled on the backend — every file
 * must be fetched through the authenticated `secure-file` proxy
 * (IMAGE_AND_AUDIO_HANDLING.md §1, §4). The bytes are fetched with the auth
 * header and rendered as a `data:` URI rather than passed to
 * <Image source={{ uri, headers }}> — RN's native image loader doesn't
 * reliably honor custom headers on every platform/proxy combination, which
 * is why that approach silently showed a blank/broken image even for a
 * correct secure-file URL (see Avatar.tsx / secureImageFetch.ts).
 */
export default function SecureImage({ url, style, ...rest }: Props) {
  const token = useAuthToken();
  // Local device files (e.g. a just-picked/just-captured attachment shown
  // optimistically before upload) must bypass the secure-file fetch path:
  // the bytes are already on device, and RN's global fetch can't read
  // file:// or content:// URIs, so fetching would render a blank placeholder.
  const isLocalUri = !!url && /^(file|content|data|blob):/i.test(url);

  const candidates = useMemo(() => {
    if (!url || isLocalUri || token === undefined) return [];
    const headers = token
      ? { authToken: token, "x-access-token": token }
      : undefined;
    return [
      { uri: resolveSecureFileUrl(url), headers },
      { uri: resolveFileUrl(url), headers },
    ];
  }, [url, token, isLocalUri]);

  const cacheKey = url ?? "";
  const [resolvedUri, setResolvedUri] = useState<string | null>(() =>
    getCachedImageUri(cacheKey),
  );

  useEffect(() => {
    if (!url || isLocalUri) return;
    if (candidates.length === 0) {
      setResolvedUri(null);
      return;
    }
    let cancelled = false;
    resolveImageUri(cacheKey, candidates).then((uri) => {
      if (!cancelled) setResolvedUri(uri);
    });
    return () => {
      cancelled = true;
    };
  }, [candidates, cacheKey, isLocalUri, url]);

  if (!url) return null;

  if (isLocalUri) {
    return <Image {...rest} source={{ uri: url }} style={style} />;
  }

  if (!resolvedUri) {
    return <View style={style} />;
  }

  return <Image {...rest} source={{ uri: resolvedUri }} style={style} />;
}
