export function getUserAvatarUrl(
  user?: {
    image?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    full_name?: string | null;
  } | null,
): string {
  if (user?.image) {
    if (
      user.image.startsWith("http://") ||
      user.image.startsWith("https://") ||
      user.image.startsWith("data:")
    ) {
      return user.image;
    }
    const apiBase =
      process.env.EXPO_PUBLIC_API_BASE_URL ??
      "https://backend-planit.soulservices.com/api/v1";
    const serverDomain = apiBase
      .replace(/\/api\/v1\/?$/, "")
      .replace(/\/$/, "");
    const clean = user.image.replace(/^\/+/, "");
    if (clean.includes("/")) {
      return `${serverDomain}/${clean}`;
    }
    return `${serverDomain}/uploads/users/${clean}`;
  }

  const name =
    [user?.first_name, user?.last_name].filter(Boolean).join(" ") ||
    user?.full_name ||
    "User";

  return `https://ui-avatars.com/api/?name=${encodeURIComponent(
    name,
  )}&background=00DEAB&color=ffffff&bold=true&rounded=false`;
}
