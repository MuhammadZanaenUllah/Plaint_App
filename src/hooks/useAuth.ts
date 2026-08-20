import { AuthContext, AuthContextValue } from "@/context/AuthContext";
import { useContext } from "react";

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    console.log("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
