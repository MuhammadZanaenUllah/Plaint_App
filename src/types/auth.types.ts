export type LoginRequest = {
  email: string;
  password: string;
};

export type UserData = {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  role: number;
  company_id: number;
  status: number;
  department: number;
  is_head: string;
  wrokfrom_home: number;
  image: string;
  role_title: string;
  user_permissions: string[];
  /** Present in the login payload; used to bypass the permission/login gates. */
  is_saas_admin?: boolean;
  user_type?: string;
  has_seen_welcome?: boolean;
};

export type CompanyPolicy = {
  id: number;
  policy_id: number;
  company_id: number;
  user_id: number;
  leavePolicy: unknown[];
  attendencePolicy: unknown[];
  hrPolicy: Record<string, unknown>;
};

export type Company = {
  company_id: number;
  company_name: string;
  company_status: number;
  company_identifier: string;
  company_allowed_users: number;
  package_name: string;
  package_id: number;
  modules: string[];
  policy: CompanyPolicy;
};

export type LoginUser = {
  name: string;
  userdata: UserData;
  company: Company;
};

export type LoginSuccessResponse = {
  Good: true;
  authToken: string;
  company_id: number;
  sessionTimeoutMins: number;
  user: LoginUser;
};

export type LoginDefaultPasswordResponse = {
  Good: true;
  isDefaultPassword: true;
  userEmail: string;
  message: string;
};

export type VerifyEmailRequest = {
  email: string;
};

export type VerifyEmailResponse = {
  success: boolean;
  message: string;
};

export type ResetPasswordRequest = {
  token: string;
  password: string;
  confirmPassword: string;
};

export type ResetPasswordResponse = {
  success: boolean;
  message: string;
};

export type InitialPasswordResetRequest = {
  email: string;
  password: string;
  confirmPassword: string;
};

export type InitialPasswordResetResponse = {
  Good: true;
  data: string;
};
