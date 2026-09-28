import { apiGet } from "./client";

// ─── Company directory ────────────────────────────────────────────────────────
// GET /user/company-active-users?company_id=
// Used to build the "Add People" contact list with email addresses (room
// members returned by GET /chat/rooms do not include an email).

export type CompanyActiveUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  email?: string;
  image?: string;
};

type GetCompanyActiveUsersResponse = {
  Good?: boolean;
  data?: { users?: CompanyActiveUser[] } | CompanyActiveUser[];
  users?: CompanyActiveUser[];
};

export async function getCompanyActiveUsers(
  companyId: number
): Promise<CompanyActiveUser[]> {
  const res = await apiGet<GetCompanyActiveUsersResponse>(
    "/user/company-active-users",
    { company_id: companyId }
  );
  const data = res?.data;
  if (Array.isArray(data)) return data;
  return data?.users ?? res?.users ?? [];
}
