import { useEffect, useMemo, useState } from "react";
import { Image, StyleProp, Text, View, ViewStyle } from "react-native";
import { getStoredToken } from "@/utils/token";

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

// The backend's exact convention for user profile images isn't documented —
// some fields come back as full `/public/...` paths, others (e.g. the login
// response's `userdata.image`) as a bare filename with no directory, and
// direct static `/public/...` access may or may not require the
// authenticated `secure-file` proxy depending on the file. Rather than
// guess wrong and show a broken image, try a short list of plausible
// URLs in order and fall back to initials only once all of them fail —
// this can only improve on the current initials-only behavior, never
// regress it.
function buildCandidateUrls(imagePath: string, token: string | null): { uri: string; headers?: Record<string, string> }[] {
  if (/^(https?:|data:)/.test(imagePath)) {
    return [{ uri: imagePath }];
  }

  const origin = getServerOrigin();
  const clean = imagePath.replace(/^\/+/, "");
  const hasDir = clean.includes("/");

  const relPaths = hasDir
    ? [
        clean,
        `public/${clean}`,
        `storage/${clean}`,
        `uploads/${clean}`,
      ]
    : [
        `uploads/users/${clean}`,
        `uploads/profile/${clean}`,
        `profile/${clean}`,
        `users/${clean}`,
        `storage/users/${clean}`,
        `storage/profile/${clean}`,
        `public/uploads/users/${clean}`,
        `public/uploads/profile/${clean}`,
        `public/users/${clean}`,
        `images/users/${clean}`,
        `images/profile/${clean}`,
        `users/docs/${clean}`,
        `uploads/${clean}`,
        clean,
      ];

  const authHeaders = token ? { authToken: token, "x-access-token": token } : undefined;
  const candidates: { uri: string; headers?: Record<string, string> }[] = [];
  for (const rel of relPaths) {
    candidates.push({ uri: `${origin}/${rel}`, headers: authHeaders });
    candidates.push({ uri: `${origin}/public/${rel}`, headers: authHeaders });
    candidates.push({
      uri: `${origin}/api/v1/secure-file?p=${encodeURIComponent(rel)}`,
      headers: authHeaders,
    });
  }
  return candidates;
}

/** Profile photo with an initials-circle fallback (shown while resolving,
 *  when there's no image, or once every candidate URL has failed to load). */
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
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    getStoredToken().then(setToken);
  }, []);

  const candidates = useMemo(
    () => (imagePath ? buildCandidateUrls(imagePath, token) : []),
    [imagePath, token]
  );
  const [candidateIndex, setCandidateIndex] = useState(0);

  useEffect(() => {
    setCandidateIndex(0);
  }, [candidates]);

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

  const exhausted = candidates.length === 0 || candidateIndex >= candidates.length;

  if (exhausted) {
    return (
      <View style={circleStyle}>
        <Text style={{ color: textColor, fontSize: fontSize ?? Math.round(size * 0.4), fontFamily }}>
          {getInitials(name)}
        </Text>
      </View>
    );
  }

  return (
    <View style={circleStyle}>
      <Image
        source={candidates[candidateIndex]}
        style={{ width: size, height: size }}
        onError={() => setCandidateIndex((i) => i + 1)}
      />
    </View>
  );
}
