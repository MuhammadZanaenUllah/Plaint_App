import { SERVER_ORIGIN } from "@/config/env";

export function getUserAvatarUrl(
  user?: {
    image?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    full_name?: string | null;
  } | null,
): string {
  const imagePath = user?.image;
  if (
    imagePath &&
    typeof imagePath === "string" &&
    imagePath.trim() !== "" &&
    !["null", "undefined", "none", "default.png", "default.jpg"].includes(
      imagePath.trim().toLowerCase(),
    )
  ) {
    if (/^(https?:|data:)/.test(imagePath)) {
      return imagePath;
    }
    const origin = SERVER_ORIGIN;
    const clean = imagePath.replace(/^\/+/, "");
    const securePath = clean.startsWith("public/")
      ? clean
      : clean.includes("/")
        ? `public/${clean}`
        : `public/users/docs/${clean}`;
    return `${origin}/api/v1/secure-file?p=${encodeURIComponent(securePath)}`;
  }

  const name =
    [user?.first_name, user?.last_name].filter(Boolean).join(" ") ||
    user?.full_name ||
    "User";

  return `https://ui-avatars.com/api/?name=${encodeURIComponent(
    name,
  )}&background=00DEAB&color=ffffff&bold=true&rounded=false`;
}
