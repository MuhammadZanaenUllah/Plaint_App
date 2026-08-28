import {
  getCachedImageUri,
  resolveImageUri,
  useAuthToken,
} from "@/utils/secureImageFetch";
import { useEffect, useMemo, useState } from "react";
import { Image, StyleProp, Text, View, ViewStyle } from "react-native";

type Props = {
  /** Full name (or best-effort name) used for the initials fallback. */
  name?: string | null;
  /** Raw `image` value from the API — may be a full URL, a `/public/...`
   *  relative path, or a bare filename with no directory at all. */
  imagePath?: string | null;
  size: number;
  borderRadius?: number;
  backgroundColor?: string;
  textColor?: string;
  fontSize?: number;
  fontFamily?: string;
  style?: StyleProp<ViewStyle>;
};

function getInitials(name?: string | null): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getServerOrigin(): string {
  const apiBase =
    process.env.EXPO_PUBLIC_API_BASE_URL ??
    "https://backend-planit.soulservices.com/api/v1";
  return apiBase.replace(/\/api\/v1\/?$/, "").replace(/\/$/, "");
}

function isInvalidImagePath(path?: string | null): boolean {
  if (!path || typeof path !== "string") return true;
  const p = path.trim().toLowerCase();
  return (
    p === "" ||
    p === "null" ||
    p === "undefined" ||
    p === "none" ||
    p === "default.png" ||
    p === "default.jpg" ||
    p === "avatar.png" ||
    p === "user.png" ||
    p === "profile.png"
  );
}

// Direct static `/public/...` access is disabled on the backend — every
// protected file must go through the authenticated secure-file proxy
// (`GET {origin}/api/v1/secure-file?p=public/<path>`, header: authToken).
// This mirrors documents/IMAGE_AND_AUDIO_HANDLING.md's AuthenticatedImage,
// which is this same backend's proven working pattern for the legacy web
// client. The bare-filename candidate directories below are still a guess
// (that convention isn't documented) — only the secure-file wrapping is
// known-correct.
function buildCandidateUrls(
  imagePath: string,
  token: string | null,
): { uri: string; headers?: Record<string, string> }[] {
  if (/^(https?:|data:)/.test(imagePath)) {
    return [{ uri: imagePath }];
  }

  const origin = getServerOrigin();
  const clean = imagePath.replace(/^\/+/, "");
  const hasDir = clean.includes("/");

  const relPaths = hasDir
    ? [clean]
    : [
        "users/docs/" + clean,
        "users/images/" + clean,
        "uploads/users/" + clean,
        "uploads/profile/" + clean,
        "profile/" + clean,
        "users/" + clean,
        "storage/users/" + clean,
        "storage/profile/" + clean,
        "images/users/" + clean,
        "images/profile/" + clean,
        "uploads/" + clean,
        clean,
      ];

  // Matches services/api/client.ts's buildHeaders exactly — this backend's
  // auth middleware is only confirmed to accept these two header names
  // together (every other authenticated request in the app sends both).
  const authHeaders = token
    ? { "x-access-token": token, authToken: token }
    : undefined;
  const candidates: { uri: string; headers?: Record<string, string> }[] = [];
  for (const rel of relPaths) {
    const securePath = rel.startsWith("public/") ? rel : `public/${rel}`;
    candidates.push({
      uri: `${origin}/api/v1/secure-file?p=${encodeURIComponent(securePath)}`,
      headers: authHeaders,
    });
  }
  return candidates;
}

/** Profile photo with an initials-circle fallback (shown while resolving,
 *  when there's no image, or once every candidate URL has failed to load).
 *
 *  Images are fetched with the auth header via `fetch` + converted to a
 *  `data:` URI rather than passed to <Image source={{ uri, headers }}> —
 *  RN's native image loader doesn't reliably honor custom headers on every
 *  platform/proxy combination, which is why this always fell back to
 *  initials even for the "correct" secure-file URL. */
export default function Avatar({
  name,
  imagePath,
  size,
  borderRadius,
  backgroundColor = "#00DEAB",
  textColor = "#fff",
  fontSize,
  fontFamily = "SF_Pro_Bold",
  style,
}: Props) {
  const token = useAuthToken();

  const candidates = useMemo(
    () =>
      token !== undefined && !isInvalidImagePath(imagePath)
        ? buildCandidateUrls(imagePath!, token)
        : [],
    [imagePath, token],
  );

  const cacheKey = isInvalidImagePath(imagePath) ? "" : `${imagePath}`;
  const [resolvedUri, setResolvedUri] = useState<string | null>(() =>
    getCachedImageUri(cacheKey),
  );

  useEffect(() => {
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
  }, [candidates, cacheKey]);

  const circleStyle: StyleProp<ViewStyle> = [
    {
      width: size,
      height: size,
      borderRadius: borderRadius ?? size / 2,
      backgroundColor,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    style,
  ];

  if (!resolvedUri) {
    return (
      <View style={circleStyle}>
        <Text
          style={{
            color: textColor,
            fontSize: fontSize ?? Math.round(size * 0.4),
            fontFamily,
          }}
        >
          {getInitials(name)}
        </Text>
      </View>
    );
  }

  return (
    <View style={circleStyle}>
      <Image
        source={{ uri: resolvedUri }}
        style={{ width: size, height: size }}
      />
    </View>
  );
}
