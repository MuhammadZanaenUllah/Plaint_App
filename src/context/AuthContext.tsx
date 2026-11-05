import { resetTaskStores } from "@/features/tasks/store";
import * as authService from "@/services/api/auth.service";
import { setAuthFailureHandler } from "@/services/api/client";
import { getCompanyModules } from "@/services/api/modules.service";
import { onSocketEvent } from "@/services/socket/socketService";
import { Company, UserData } from "@/types/auth.types";
import { invalidateAuthTokenCache } from "@/utils/secureImageFetch";
import {
  clearAllAuth,
  getBiometricSession,
  getStoredCompany,
  getStoredToken,
  getStoredUser,
  isSessionExpired,
  isTokenExpired,
  saveBiometricSession,
  setSessionExpiresAt,
  setStoredCompany,
  setStoredToken,
  setStoredUser,
} from "@/utils/token";
import * as SecureStore from "expo-secure-store";
import React, {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";

type AuthState = {
  user: UserData | null;
  company: Company | null;
  token: string | null;
  isAuthenticated: boolean;
  isDefaultPassword: boolean;
  loading: boolean;
  defaultPasswordEmail: string;
  // Whether the company's "Advanced Task Scheduling" module is enabled (drives
  // the Create Task screen's Due Date vs Hrs/duration flow). Null until the
  // company.modules lookup resolves.
  hasAdvancedTaskModule: boolean | null;
};

type AuthAction =
  | { type: "RESTORE_SESSION"; token: string; user: UserData; company: Company }
  | { type: "LOGIN_SUCCESS"; token: string; user: UserData; company: Company }
  | { type: "DEFAULT_PASSWORD"; email: string }
  | { type: "LOGOUT" }
  | { type: "SET_LOADING"; loading: boolean }
  | { type: "SET_ADVANCED_TASK_MODULE"; enabled: boolean }
  | { type: "SET_COMPANY_MODULES"; modules: string[] }
  | { type: "SET_USER_PERMISSIONS"; permissions: string[] };

const initialState: AuthState = {
  user: null,
  company: null,
  token: null,
  isAuthenticated: false,
  isDefaultPassword: false,
  loading: true,
  defaultPasswordEmail: "",
  hasAdvancedTaskModule: null,
};

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case "RESTORE_SESSION":
      return {
        ...state,
        token: action.token,
        user: action.user,
        company: action.company,
        isAuthenticated: true,
        loading: false,
      };
    case "LOGIN_SUCCESS":
      return {
        ...state,
        token: action.token,
        user: action.user,
        company: action.company,
        isAuthenticated: true,
        isDefaultPassword: false,
        loading: false,
      };
    case "DEFAULT_PASSWORD":
      return {
        ...state,
        isDefaultPassword: true,
        defaultPasswordEmail: action.email,
        loading: false,
      };
    case "LOGOUT":
      return { ...initialState, loading: false };
    case "SET_LOADING":
      return { ...state, loading: action.loading };
    case "SET_ADVANCED_TASK_MODULE":
      return { ...state, hasAdvancedTaskModule: action.enabled };
    case "SET_COMPANY_MODULES":
      if (!state.company) return state;
      return {
        ...state,
        company: { ...state.company, modules: action.modules },
      };
    case "SET_USER_PERMISSIONS":
      // Live permission refresh (socket `role_update`). Permissions drive all
      // Chat/Task UI gating, so update the user object in place.
      if (!state.user) return state;
      return {
        ...state,
        user: { ...state.user, user_permissions: action.permissions },
      };
    default:
      return state;
  }
}

export type AuthContextValue = {
  state: AuthState;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  restoreSession: () => Promise<void>;
  handleDefaultPassword: (email: string) => void;
  setInitialPassword: (
    email: string,
    password: string,
    confirmPassword: string,
  ) => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // Latest auth state for socket handlers (registered once, no stale closure).
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    async function restore() {
      try {
        const token = await getStoredToken();
        if (!token || isTokenExpired(token) || (await isSessionExpired())) {
          await clearAllAuth();
          dispatch({ type: "LOGOUT" });
          return;
        }
        const user = await getStoredUser<UserData>();
        const company = await getStoredCompany<Company>();
        if (user && company) {
          dispatch({
            type: "RESTORE_SESSION",
            token,
            user,
            company,
          });
        } else {
          await clearAllAuth();
          dispatch({ type: "LOGOUT" });
        }
      } catch {
        await clearAllAuth();
        dispatch({ type: "LOGOUT" });
      }
    }
    restore();
  }, []);

  useEffect(() => {
    setAuthFailureHandler(() => {
      dispatch({ type: "LOGOUT" });
    });
  }, []);
  const refreshCompanyModules = useCallback(async (companyId: number) => {
    try {
      const res = await getCompanyModules(companyId);
      const modules = res?.data?.modules;
      if (!Array.isArray(modules)) return;
      dispatch({ type: "SET_COMPANY_MODULES", modules });
      dispatch({
        type: "SET_ADVANCED_TASK_MODULE",
        enabled: modules.includes("Advanced Task Scheduling"),
      });
      const current = stateRef.current;
      if (current.company) {
        await setStoredCompany({ ...current.company, modules }).catch(() => {});
      }
    } catch (err) {
      if (__DEV__) {
        console.warn("[Auth] Failed to refresh company modules:", err);
      }
    }
  }, []);

  // Live permission/module refresh (website App.js + contract §5.3). This
  // effect re-registers after logout -> login (AUD-011) and also listens for
  // modules/packages/company updates (AUD-012).
  useEffect(() => {
    if (!state.isAuthenticated) return;

    const sameCompany = (value: unknown) => {
      const current = stateRef.current;
      if (value === undefined || value === null) return true;
      return Number(value) === Number(current.company?.company_id);
    };

    const refreshModulesForEvent = (payload: unknown) => {
      const typed = payload as { company_id?: number | string };
      if (!sameCompany(typed.company_id)) return;
      const companyId = stateRef.current.company?.company_id;
      if (companyId) void refreshCompanyModules(companyId);
    };

    const cleanups = [
      onSocketEvent("role_update", (payload) => {
        const typed = payload as {
          company_id?: number | string;
          roleId?: number | string;
          action?: string;
          permissions?: string[];
        };
        if (typed.action !== "update_permissions") return;
        if (!Array.isArray(typed.permissions)) return;
        const current = stateRef.current;
        if (!current.user) return;
        const sameCompanyId =
          typed.company_id === undefined ||
          Number(typed.company_id) === Number(current.company?.company_id);
        const sameRole =
          typed.roleId === undefined ||
          Number(typed.roleId) === Number(current.user.role);
        if (!sameCompanyId || !sameRole) return;
        dispatch({ type: "SET_USER_PERMISSIONS", permissions: typed.permissions });
        setStoredUser({
          ...current.user,
          user_permissions: typed.permissions,
        }).catch(() => {});
      }),
      onSocketEvent("modules_update", refreshModulesForEvent),
      onSocketEvent("packages_update", refreshModulesForEvent),
      onSocketEvent("companies_update", refreshModulesForEvent),
    ];

    return () => cleanups.forEach((cleanup) => cleanup());
  }, [state.isAuthenticated, refreshCompanyModules]);

  // Look up the company's own module list (from its package) once a session
  // is established, so the Create Task screen knows whether to show the
  // Advanced ("Hrs"/effort) flow or the normal (Due Date) flow.
  useEffect(() => {
    if (!state.isAuthenticated || !state.company) return;
    const companyId = state.company.company_id;
    const companyModules = state.company.modules ?? [];
    const isAdvanced = (names: string[]) =>
      names.includes("Advanced Task Scheduling");
    const needsRefresh =
      companyModules.length === 0 ||
      companyModules.every((m) => /^\d+$/.test(String(m)));

    dispatch({
      type: "SET_ADVANCED_TASK_MODULE",
      enabled: isAdvanced(companyModules),
    });

    // Never call /modules/all: it is SaaS-admin only and returns 403.
    if (needsRefresh) void refreshCompanyModules(companyId);
  }, [state.isAuthenticated, state.company, refreshCompanyModules]);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const res = await authService.loginCheckDefault({ email, password });

      // apiPost resolves with the response body even on failure (e.g.
      // {"Good":false,"message":"Invalid password"}) rather than throwing —
      // without this check that error body gets treated as a successful
      // login below, crashing on `.user.userdata` instead of surfacing the
      // real "Invalid password" message to the user.
      if ((res as { Good?: boolean }).Good === false) {
        throw new Error(
          (res as { message?: string }).message || "Login failed.",
        );
      }

      if ("isDefaultPassword" in res && res.isDefaultPassword) {
        dispatch({ type: "DEFAULT_PASSWORD", email: res.userEmail });
        return;
      }

      const successRes =
        res as import("@/types/auth.types").LoginSuccessResponse;

      // Login gate (website §1.4): a normal user cannot proceed without
      // permissions or an assigned company policy. SaaS admins and Company
      // Admins are exempt.
      const ud = successRes.user.userdata;
      const roleTitle = (ud.role_title ?? "").trim().toLowerCase();
      const isCompanyAdmin = roleTitle === "company admin";
      const isSaasAdmin =
        ud.is_saas_admin === true ||
        (successRes.company_id === 0 &&
          (roleTitle === "saas admin" || ud.role === 12));
      if (!isCompanyAdmin && !isSaasAdmin) {
        if (!(ud.user_permissions ?? []).length) {
          throw new Error(
            "No permission assigned to you. Please contact company admin or hr to add permissions",
          );
        }
        if (!successRes.user.company?.policy) {
          throw new Error(
            "No policy is assigned to your account. Please contact your HR or Administrator.",
          );
        }
      }

      // console.log("=========================================");
      console.log(
        "[Auth] LOGIN userdata:",
        JSON.stringify(successRes.user.userdata),
      );
      // console.log("=========================================");
      await setStoredToken(successRes.authToken);
      await setStoredUser(successRes.user.userdata);
      await setStoredCompany(successRes.user.company);
      await setSessionExpiresAt(successRes.sessionTimeoutMins);
      invalidateAuthTokenCache();

      const bioEnabled = await SecureStore.getItemAsync(
        "pref_biometrics_enabled",
      );
      if (bioEnabled === "true") {
        await saveBiometricSession(
          successRes.authToken,
          successRes.user.userdata,
          successRes.user.company,
        );
      }

      dispatch({
        type: "LOGIN_SUCCESS",
        token: successRes.authToken,
        user: successRes.user.userdata,
        company: successRes.user.company,
      });
    } catch (error) {
      throw error;
    }
  }, []);

  const restoreSession = useCallback(async () => {
    let token = await getStoredToken();
    let user = await getStoredUser<UserData>();
    let company = await getStoredCompany<Company>();
    let sessionExpired = await isSessionExpired();

    if (!token || isTokenExpired(token) || sessionExpired || !user || !company) {
      const bioSession = await getBiometricSession();
      if (bioSession) {
        token = bioSession.token;
        user = bioSession.user;
        company = bioSession.company;
        // The biometric session was captured at the same login as the
        // primary one — it carries the same app-level session timeout, so
        // if that's what expired here, don't treat this fallback as fresh.
        await setStoredToken(token);
        await setStoredUser(user);
        await setStoredCompany(company);
      } else {
        sessionExpired = false; // nothing to restore either way — fall through to "no session"
      }
    }

    if (token && !isTokenExpired(token) && !sessionExpired && user && company) {
      dispatch({
        type: "RESTORE_SESSION",
        token,
        user,
        company,
      });
    } else {
      resetTaskStores();
      console.log(
        "No valid saved session found. Please sign in with email & password.",
      );
    }
  }, []);

  const logout = useCallback(async () => {
    resetTaskStores();
    await clearAllAuth();
    invalidateAuthTokenCache();
    dispatch({ type: "LOGOUT" });
  }, []);

  const handleDefaultPassword = useCallback((email: string) => {
    dispatch({ type: "DEFAULT_PASSWORD", email });
  }, []);

  const setInitialPassword = useCallback(
    async (email: string, password: string, confirmPassword: string) => {
      try {
        await authService.initialPasswordReset({
          email,
          password,
          confirmPassword,
        });
        dispatch({ type: "LOGOUT" });
      } catch (error) {
        throw error;
      }
    },
    [],
  );

  const value = useMemo(
    () => ({
      state,
      login,
      logout,
      restoreSession,
      handleDefaultPassword,
      setInitialPassword,
    }),
    [
      state,
      login,
      logout,
      restoreSession,
      handleDefaultPassword,
      setInitialPassword,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
