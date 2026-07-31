export type Platform = "android" | "ios";

export type RegisterDeviceRequest = {
  fcm_token: string;
  expo_push_token?: string;
  token_type?: "fcm" | "expo";
  platform: Platform;
  device_name?: string;
  company_id: number;
};

export type RegisterDeviceResponse = {
  Good: true;
  message: string;
  device_id: string;
};

export type UnregisterDeviceRequest = {
  fcm_token: string;
  company_id?: number;
};

export type UnregisterDeviceResponse = {
  Good: true;
  message: string;
};

export type UpdateDeviceTokenRequest = {
  old_fcm_token?: string;
  new_fcm_token: string;
  company_id?: number;
};

export type UpdateDeviceTokenResponse = {
  Good: true;
  message: string;
};

export type ResetBadgeRequest = {
  company_id: number;
};

export type ResetBadgeResponse = {
  Good: true;
  message: string;
};

export type PushNotificationSettings = {
  user_id: number;
  task_assigned: boolean;
  task_status_changed: boolean;
  task_comment: boolean;
  task_mention: boolean;
  chat_message: boolean;
  chat_mention: boolean;
  channel_invite: boolean;
  push_enabled: boolean;
};

export type GetNotificationSettingsResponse = {
  Good: true;
  settings: PushNotificationSettings;
};

export type UpdateNotificationSettingsRequest = {
  task_assigned?: boolean;
  task_status_changed?: boolean;
  task_comment?: boolean;
  task_mention?: boolean;
  chat_message?: boolean;
  chat_mention?: boolean;
  channel_invite?: boolean;
  push_enabled?: boolean;
};

export type UpdateNotificationSettingsResponse = {
  Good: true;
  message: string;
  settings: PushNotificationSettings;
};

export type PushNotificationData = {
  type: "task" | "tasks" | "lead" | "chat" | "notification";
  task_id?: string;
  lead_id?: string;
  room_id?: string;
  filter?: string;
  screen?: string;
};

export type PushNotificationPayload = {
  notification: {
    title: string;
    body: string;
    image?: string;
  };
  data: PushNotificationData;
};

export type PushNotificationState = {
  expoPushToken: string | null;
  notification: PushNotificationData | null;
  permissionStatus: "undetermined" | "granted" | "denied" | "provisional";
  registered: boolean;
  deviceId: string | null;
};
