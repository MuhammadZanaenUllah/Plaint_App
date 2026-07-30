import { apiGet, apiPost } from "./client";
import type {
  RegisterDeviceRequest,
  RegisterDeviceResponse,
  UnregisterDeviceRequest,
  UnregisterDeviceResponse,
  UpdateDeviceTokenRequest,
  UpdateDeviceTokenResponse,
  ResetBadgeRequest,
  ResetBadgeResponse,
  GetNotificationSettingsResponse,
  UpdateNotificationSettingsRequest,
  UpdateNotificationSettingsResponse,
} from "@/types/push.types";

const NOTIFICATION_PREFIX = "/notification";

export async function registerDevice(
  data: RegisterDeviceRequest
): Promise<RegisterDeviceResponse> {
  return apiPost<RegisterDeviceResponse>(
    `${NOTIFICATION_PREFIX}/register-device`,
    data
  );
}

export async function unregisterDevice(
  data: UnregisterDeviceRequest
): Promise<UnregisterDeviceResponse> {
  return apiPost<UnregisterDeviceResponse>(
    `${NOTIFICATION_PREFIX}/unregister-device`,
    data
  );
}

export async function updateDeviceToken(
  data: UpdateDeviceTokenRequest
): Promise<UpdateDeviceTokenResponse> {
  return apiPost<UpdateDeviceTokenResponse>(
    `${NOTIFICATION_PREFIX}/update-device-token`,
    data
  );
}

export async function resetBadge(
  data: ResetBadgeRequest
): Promise<ResetBadgeResponse> {
  return apiPost<ResetBadgeResponse>(
    `${NOTIFICATION_PREFIX}/reset-badge`,
    data
  );
}

export async function getPushNotificationSettings(): Promise<GetNotificationSettingsResponse> {
  return apiGet<GetNotificationSettingsResponse>(
    `${NOTIFICATION_PREFIX}/settings`
  );
}

export async function updatePushNotificationSettings(
  data: UpdateNotificationSettingsRequest
): Promise<UpdateNotificationSettingsResponse> {
  return apiPost<UpdateNotificationSettingsResponse>(
    `${NOTIFICATION_PREFIX}/settings`,
    data
  );
}
