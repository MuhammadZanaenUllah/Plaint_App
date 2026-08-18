import { apiGet } from "./client";
import { ApiResponse } from "@/types/api.types";

export type CompanyModule = {
  id: number;
  name: string;
  status: number;
};

// Returns the modules enabled for the current logged-in user's company
// (scoped server-side via the auth token — no company_id param needed).
export async function getModules(): Promise<ApiResponse<{ modules: CompanyModule[] }>> {
  return apiGet<ApiResponse<{ modules: CompanyModule[] }>>("/modules/all");
}
