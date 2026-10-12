/**
 * Centralized, validated environment configuration.
 *
 * `EXPO_PUBLIC_*` variables are inlined into the JS bundle at build/export
 * time (not read at runtime), so they MUST be referenced literally as
 * `process.env.EXPO_PUBLIC_X` for Expo to substitute them.
 *
 * There is deliberately NO production fallback: a missing value fails fast
 * instead of silently pointing the app at the live backend. Set values per
 * environment via:
 *   - local dev:        `.env` (gitignored)
 *   - EAS builds:       `eas.json` → build.<profile>.env
 *   - EAS OTA updates:  EAS environment variables + `eas update --environment`
 */

function required(name: string, value: string | undefined): string {
  if (!value || !value.trim()) {
    throw new Error(
      `[env] ${name} is not set. Configure it in eas.json (build.<profile>.env), ` +
        `EAS environment variables, or .env for local development.`,
    );
  }
  return value;
}

export const API_BASE_URL = required(
  "EXPO_PUBLIC_API_BASE_URL",
  process.env.EXPO_PUBLIC_API_BASE_URL || `https://backend.planit.pk/api/v1/`,
);

export const SOCKET_URL = required(
  "EXPO_PUBLIC_SOCKET_URL",
  process.env.EXPO_PUBLIC_SOCKET_URL || `https://backend.planit.pk`,
);

/** API base with the trailing `/api/v1` removed, e.g. for building file URLs. */
export const SERVER_ORIGIN = API_BASE_URL.replace(/\/api\/v1\/?$/, "").replace(
  /\/$/,
  "",
);
