import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "auth_token";
const USER_KEY = "auth_user";
const COMPANY_KEY = "auth_company";
const SESSION_EXPIRES_AT_KEY = "auth_session_expires_at";

export async function getStoredToken(): Promise<string | null> {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  if (token) {
    // console.log("=========================================");
    // console.log("🔐 [FULL JWT ACCESS TOKEN RETRIEVED]:");
    // console.log(token);
    // console.log("=========================================");
  } else {
    // console.log("🔐 [ACCESS TOKEN] No stored token found in SecureStore.");
  }
  return token;
}

export async function setStoredToken(token: string): Promise<void> {
  // console.log("=========================================");
  // console.log("🔐 [FULL JWT ACCESS TOKEN STORED ON LOGIN]:");
  // console.log(token);
  // console.log("=========================================");
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function removeStoredToken(): Promise<void> {
  // console.log("🔐 [ACCESS TOKEN] Removed JWT Access Token from SecureStore.");
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export async function getStoredUser<T>(): Promise<T | null> {
  const raw = await SecureStore.getItemAsync(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function setStoredUser<T>(user: T): Promise<void> {
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
}

export async function removeStoredUser(): Promise<void> {
  await SecureStore.deleteItemAsync(USER_KEY);
}

export async function getStoredCompany<T>(): Promise<T | null> {
  const raw = await SecureStore.getItemAsync(COMPANY_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function setStoredCompany<T>(company: T): Promise<void> {
  await SecureStore.setItemAsync(COMPANY_KEY, JSON.stringify(company));
}

export async function removeStoredCompany(): Promise<void> {
  await SecureStore.deleteItemAsync(COMPANY_KEY);
}

// The login response's `sessionTimeoutMins` tells the client how long the
// server considers this session's data (company/modules/permissions) fresh
// — it's much shorter than the JWT's own multi-day `exp`. We track our own
// expiry from it so a long-lived JWT doesn't let a restored session run on
// stale company data (e.g. modules/package) indefinitely between real
// logins; once it elapses, session restore is skipped and the user must log
// in again to pick up current data.
export async function setSessionExpiresAt(sessionTimeoutMins: number): Promise<void> {
  const expiresAt = Date.now() + sessionTimeoutMins * 60 * 1000;
  await SecureStore.setItemAsync(SESSION_EXPIRES_AT_KEY, String(expiresAt));
}

export async function isSessionExpired(): Promise<boolean> {
  const raw = await SecureStore.getItemAsync(SESSION_EXPIRES_AT_KEY);
  if (!raw) return false; // no recorded timeout — don't force-expire older sessions
  const expiresAt = Number(raw);
  if (!Number.isFinite(expiresAt)) return false;
  return Date.now() >= expiresAt;
}

export async function removeSessionExpiresAt(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_EXPIRES_AT_KEY);
}

export async function clearAllAuth(): Promise<void> {
  await Promise.all([
    removeStoredToken(),
    removeStoredUser(),
    removeStoredCompany(),
    removeSessionExpiresAt(),
  ]);
}

export function parseJwtExp(token: string): number | null {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    const payload = JSON.parse(jsonPayload);
    return payload.exp ?? null;
  } catch {
    return null;
  }
}

export function isTokenExpired(token: string): boolean {
  const exp = parseJwtExp(token);
  if (!exp) return true;
  return Date.now() >= exp * 1000;
}

const BIO_TOKEN_KEY = "bio_token";
const BIO_USER_KEY = "bio_user";
const BIO_COMPANY_KEY = "bio_company";

export async function saveBiometricSession(
  token: string,
  user: any,
  company: any
): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(BIO_TOKEN_KEY, token),
    SecureStore.setItemAsync(BIO_USER_KEY, JSON.stringify(user)),
    SecureStore.setItemAsync(BIO_COMPANY_KEY, JSON.stringify(company)),
  ]);
}

export async function getBiometricSession(): Promise<{
  token: string;
  user: any;
  company: any;
} | null> {
  try {
    const token = await SecureStore.getItemAsync(BIO_TOKEN_KEY);
    const rawUser = await SecureStore.getItemAsync(BIO_USER_KEY);
    const rawCompany = await SecureStore.getItemAsync(BIO_COMPANY_KEY);

    if (!token || !rawUser || !rawCompany) return null;
    if (isTokenExpired(token)) return null;

    return {
      token,
      user: JSON.parse(rawUser),
      company: JSON.parse(rawCompany),
    };
  } catch {
    return null;
  }
}

export async function removeBiometricSession(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(BIO_TOKEN_KEY),
    SecureStore.deleteItemAsync(BIO_USER_KEY),
    SecureStore.deleteItemAsync(BIO_COMPANY_KEY),
  ]);
}
