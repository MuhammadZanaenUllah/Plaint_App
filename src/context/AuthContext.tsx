import React, { createContext, useCallback, useEffect, useReducer, useState } from "react";
import * as authService from "@/services/api/auth.service";
import {
  getStoredToken,
  setStoredToken,
  getStoredUser,
  setStoredUser,
  getStoredCompany,
  setStoredCompany,
  clearAllAuth,
  isTokenExpired,
} from "@/utils/token";
import { setAuthFailureHandler } from "@/services/api/client";
import { extractErrorMessage } from "@/utils/errorHandler";
import { UserData, Company } from "@/types/auth.types";

type AuthState = {
  user: UserData | null;
  company: Company | null;
  token: string | null;
  isAuthenticated: boolean;
  isDefaultPassword: boolean;
  loading: boolean;
  defaultPasswordEmail: string;
};

type AuthAction =
  | { type: "RESTORE_SESSION"; token: string; user: UserData; company: Company }
  | { type: "LOGIN_SUCCESS"; token: string; user: UserData; company: Company }
  | { type: "DEFAULT_PASSWORD"; email: string }
  | { type: "LOGOUT" }
  | { type: "SET_LOADING"; loading: boolean };

const initialState: AuthState = {
  user: null,
  company: null,
  token: null,
  isAuthenticated: false,
  isDefaultPassword: false,
  loading: true,
  defaultPasswordEmail: "",
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
    default:
      return state;
  }
}

export type AuthContextValue = {
  state: AuthState;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  handleDefaultPassword: (email: string) => void;
  setInitialPassword: (
    email: string,
    password: string,
    confirmPassword: string
  ) => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  useEffect(() => {
    async function restore() {
      try {
        const token = await getStoredToken();
        if (!token || isTokenExpired(token)) {
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

  const login = useCallback(async (email: string, password: string) => {
    try {
      const res = await authService.loginCheckDefault({ email, password });

      if ("isDefaultPassword" in res && res.isDefaultPassword) {
        dispatch({ type: "DEFAULT_PASSWORD", email: res.userEmail });
        return;
      }

      const successRes = res as import("@/types/auth.types").LoginSuccessResponse;
      console.log("=========================================");
      // console.log("🔑 [FULL ACCESS TOKEN ON LOGIN]:");
      // console.log(successRes.authToken);
      // console.log("=========================================");
      await setStoredToken(successRes.authToken);
      await setStoredUser(successRes.user.userdata);
      await setStoredCompany(successRes.user.company);

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

  const logout = useCallback(async () => {
    await clearAllAuth();
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
    []
  );

  return (
    <AuthContext.Provider
      value={{ state, login, logout, handleDefaultPassword, setInitialPassword }}
    >
      {children}
    </AuthContext.Provider>
  );
}
