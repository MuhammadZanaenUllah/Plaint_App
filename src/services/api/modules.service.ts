import { apiGet } from "./client";
import type { ApiResponse } from "@/types/api.types";

export type CompanyModule = {
  id: number;
  name: string;
  status: number;
};

/** Company module names (contract §8.2). Works for company users on their own company. */
export async function getCompanyModules(
  companyId: number,
): Promise<ApiResponse<{ modules: string[] }>> {
  return apiGet<ApiResponse<{ modules: string[] }>>(
    `/companies/${companyId}/modules`,
  );
}

/** Never call GET /modules/all from the app: it is SaaS-admin only (403). */
export const FORBIDDEN_MODULES_ENDPOINT = "/modules/all";
