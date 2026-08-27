import { useAuth } from "@/hooks/useAuth";
import {
  getPushNotificationSettings,
  updatePushNotificationSettings,
} from "@/services/api/push.service";
import {
  getHapticIntensity,
  HapticIntensity,
  setHapticIntensityCache,
  setHapticsEnabledCache,
  triggerHaptic,
} from "@/utils/haptics";
import { showError, showSuccess } from "@/utils/toast";
import { removeBiometricSession, saveBiometricSession } from "@/utils/token";
import Avatar from "@/components/Avatar";
import { getUserAvatarUrl } from "@/utils/userHelpers";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as LocalAuthentication from "expo-local-authentication";
import { router } from "expo-router";
import * as FileSystem from "expo-file-system/legacy";
import * as SecureStore from "expo-secure-store";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { state: authState, logout } = useAuth();
  const user = authState.user;

  // Preferences local state
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [emailSummaryEnabled, setEmailSummaryEnabled] = useState(true);
  const [hapticsEnabled, setHapticsEnabled] = useState(true);
  const [hapticIntensity, setHapticIntensity] =
    useState<HapticIntensity>("Medium");
  const [biometricsEnabled, setBiometricsEnabled] = useState(false);

  // Cache & Modal states
  const [cacheCleared, setCacheCleared] = useState(false);
  const [cacheSizeText, setCacheSizeText] = useState("0.0 KB");
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [updatingPassword, setUpdatingPassword] = useState(false);

  const calculateCacheSize = useCallback(async () => {
    try {
      if (!FileSystem.cacheDirectory) {
        setCacheSizeText("0.0 KB");
        return;
      }
      const files = await FileSystem.readDirectoryAsync(FileSystem.cacheDirectory);
      let totalBytes = 0;
      for (const file of files) {
        try {
          const info = await FileSystem.getInfoAsync(FileSystem.cacheDirectory + file);
          if (info.exists && !info.isDirectory) {
            totalBytes += info.size ?? 0;
          }
        } catch {
          // ignore individual unreadable files
        }
      }
      if (totalBytes === 0) {
        setCacheSizeText("0.0 KB (Clean)");
      } else if (totalBytes < 1024 * 1024) {
        setCacheSizeText(`${(totalBytes / 1024).toFixed(1)} KB temporary data`);
      } else {
        setCacheSizeText(`${(totalBytes / (1024 * 1024)).toFixed(1)} MB temporary data`);
      }
    } catch {
      setCacheSizeText("0.0 KB");
    }
  }, []);

  useEffect(() => {
    calculateCacheSize();
  }, [calculateCacheSize]);

  // Redesigned Custom Confirmation Alert State
  const [alertConfig, setAlertConfig] = useState<{
    visible: boolean;
    title: string;
    description: string;
    confirmText: string;
    iconName: keyof typeof Ionicons.glyphMap;
    iconColor: string;
    iconBgColor: string;
    confirmBgColor: string;
    onConfirm: () => Promise<void> | void;
  }>({
    visible: false,
    title: "",
    description: "",
    confirmText: "",
    iconName: "log-out-outline",
    iconColor: "#EF4444",
    iconBgColor: "#FEE2E2",
    confirmBgColor: "#EF4444",
    onConfirm: () => {},
  });

  // User Initials
  const userInitials = (() => {
    if (!user) return "U";
    const f = user.first_name?.[0] ?? "";
    const l = user.last_name?.[0] ?? "";
    return (f + l).toUpperCase() || "U";
  })();

  const fullName =
    [user?.first_name, user?.last_name].filter(Boolean).join(" ") || "User";

  // Fetch Push Settings & Local Preferences
  useEffect(() => {
    let isMounted = true;
    setPushLoading(true);
    getPushNotificationSettings()
      .then((res) => {
        if (isMounted) {
          setPushEnabled(res?.settings?.push_enabled ?? false);
        }
      })
      .catch(() => {
        if (isMounted) setPushEnabled(false);
      })
      .finally(() => {
        if (isMounted) setPushLoading(false);
      });

    SecureStore.getItemAsync("pref_sound").then((val: string | null) => {
      if (val !== null && isMounted) setSoundEnabled(val === "true");
    });
    SecureStore.getItemAsync("pref_email_summary").then(
      (val: string | null) => {
        if (val !== null && isMounted) setEmailSummaryEnabled(val === "true");
      },
    );
    SecureStore.getItemAsync("pref_haptics").then((val: string | null) => {
      if (val !== null && isMounted) setHapticsEnabled(val === "true");
    });
    getHapticIntensity().then((val) => {
      if (isMounted) setHapticIntensity(val);
    });
    SecureStore.getItemAsync("pref_biometrics_enabled").then(
      (val: string | null) => {
        if (val !== null && isMounted) setBiometricsEnabled(val === "true");
      },
    );

    return () => {
      isMounted = false;
    };
  }, []);

  const handleBiometricToggle = async (value: boolean) => {
    if (value) {
      try {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();

        if (!hasHardware) {
          showError(
            "Biometrics Unavailable",
            "This device hardware does not support Face ID or Fingerprint.",
          );
          return;
        }

        if (!isEnrolled) {
          showError(
            "Biometrics Not Enrolled",
            "Please set up Face ID or Fingerprint in your device settings.",
          );
          return;
        }

        const res = await LocalAuthentication.authenticateAsync({
          promptMessage:
            "Verify Face ID / Fingerprint to enable Biometric Login",
          fallbackLabel: "Cancel",
        });

        if (res.success) {
          setBiometricsEnabled(true);
          await SecureStore.setItemAsync("pref_biometrics_enabled", "true");
          if (authState.token && authState.user && authState.company) {
            await saveBiometricSession(
              authState.token,
              authState.user,
              authState.company,
            );
          }
          showSuccess("Face ID / Fingerprint login enabled!");
        } else {
          showError(
            "Authentication Failed",
            "Biometric verification was not completed.",
          );
        }
      } catch (err: any) {
        showError(
          "Biometric Error",
          err?.message || "Failed to verify biometrics",
        );
      }
    } else {
      setBiometricsEnabled(false);
      await SecureStore.setItemAsync("pref_biometrics_enabled", "false");
      await removeBiometricSession();
      showSuccess("Biometric login disabled");
    }
  };

  const handlePushToggle = useCallback(
    async (value: boolean) => {
      const prev = pushEnabled;
      setPushEnabled(value);
      setPushLoading(true);
      try {
        const res = await updatePushNotificationSettings({
          push_enabled: value,
        });
        setPushEnabled(res?.settings?.push_enabled ?? value);
        showSuccess(
          value ? "Push notifications enabled" : "Push notifications disabled",
        );
      } catch (err: any) {
        setPushEnabled(prev);
        showError(err?.message ?? "Failed to update notification settings");
      } finally {
        setPushLoading(false);
      }
    },
    [pushEnabled],
  );

  const handleSoundToggle = (value: boolean) => {
    triggerHaptic("selection");
    setSoundEnabled(value);
    SecureStore.setItemAsync("pref_sound", String(value));
  };

  const handleEmailSummaryToggle = (value: boolean) => {
    triggerHaptic("selection");
    setEmailSummaryEnabled(value);
    SecureStore.setItemAsync("pref_email_summary", String(value));
  };

  const handleHapticsToggle = (value: boolean) => {
    setHapticsEnabled(value);
    setHapticsEnabledCache(value);
    if (value) {
      triggerHaptic("medium");
    }
  };

  const handleHapticIntensityChange = (level: HapticIntensity) => {
    setHapticIntensity(level);
    setHapticIntensityCache(level);
    if (level === "Light") triggerHaptic("light");
    else if (level === "Medium") triggerHaptic("medium");
    else triggerHaptic("heavy");
  };

  const handleClearCache = () => {
    setAlertConfig({
      visible: true,
      title: "Clear Local Cache",
      description:
        "Are you sure you want to clear temporary files and cached settings? This action cannot be undone.",
      confirmText: "Clear Cache",
      iconName: "trash-outline",
      iconColor: "#00DEAB",
      iconBgColor: "#E6FBF7",
      confirmBgColor: "#00DEAB",
      onConfirm: async () => {
        setAlertConfig((prev) => ({ ...prev, visible: false }));
        try {
          if (FileSystem.cacheDirectory) {
            const files = await FileSystem.readDirectoryAsync(FileSystem.cacheDirectory);
            for (const file of files) {
              try {
                await FileSystem.deleteAsync(FileSystem.cacheDirectory + file, { idempotent: true });
              } catch {
                // ignore individually locked files
              }
            }
          }
          await SecureStore.deleteItemAsync("pref_sound").catch(() => {});
          await SecureStore.deleteItemAsync("pref_email_summary").catch(() => {});
          await SecureStore.deleteItemAsync("pref_haptics").catch(() => {});
          setCacheCleared(true);
          setCacheSizeText("0.0 KB (Cleaned)");
          triggerHaptic("success");
          showSuccess("Local cache and temporary files cleared successfully");
        } catch (err) {
          console.log("[Cache] Clear error:", err);
          showError("Failed to clear some cache files");
        }
      },
    });
  };

  const handlePasswordChange = () => {
    if (!oldPassword || !newPassword || !confirmPassword) {
      showError("Please fill out all password fields");
      return;
    }
    if (newPassword !== confirmPassword) {
      showError("New passwords do not match");
      return;
    }
    if (newPassword.length < 6) {
      showError("New password must be at least 6 characters");
      return;
    }

    setUpdatingPassword(true);
    setTimeout(() => {
      setUpdatingPassword(false);
      setPasswordModalVisible(false);
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      showSuccess("Password updated successfully");
    }, 1000);
  };

  const handleLogout = () => {
    setAlertConfig({
      visible: true,
      title: "Sign Out",
      description:
        "Are you sure you want to sign out of your account? You will need to log back in.",
      confirmText: "Sign Out",
      iconName: "log-out-outline",
      iconColor: "#EF4444",
      iconBgColor: "#FEE2E2",
      confirmBgColor: "#EF4444",
      onConfirm: async () => {
        setAlertConfig((prev) => ({ ...prev, visible: false }));
        await logout();
        router.replace("/(auth)/login");
      },
    });
  };

  const companyName =
    authState.company?.company_name ||
    (user as any)?.company_name ||
    (user?.company_id ? `Company #${user.company_id}` : "Company");

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      {/* ── Top Header with Seamless White Status Bar Fill ── */}
      <View style={{ paddingTop: insets.top, backgroundColor: "#FFFFFF" }}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backBtn}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={22} color="#1D1D1D" />
          </TouchableOpacity>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle}>App Settings</Text>
            <Text style={styles.headerSubtitle}>
              Preferences, security & configuration
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* ── User Profile Banner ── */}
        <View style={styles.profileCard}>
          <Avatar
            name={fullName}
            imagePath={user?.image}
            size={54}
            borderRadius={27}
          />
          <View style={styles.profileInfo}>
            <Text style={styles.userName}>{fullName}</Text>
            <Text style={styles.userRole}>
              {user?.role_title || (user as any)?.designation || "Team Member"}
            </Text>
            <Text style={styles.userEmail}>
              {user?.email || "No email available"}
            </Text>
          </View>
          <View style={styles.companyBadge}>
            <Text style={styles.companyBadgeText} numberOfLines={1}>
              {companyName}
            </Text>
          </View>
        </View>

        {/* ── Section: Notifications & Alerts ── */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>NOTIFICATIONS & PREFERENCES</Text>

          <View style={styles.card}>
            <View style={styles.row}>
              <View style={styles.rowIconWrap}>
                <Ionicons
                  name="notifications-outline"
                  size={20}
                  color="#00DEAB"
                />
              </View>
              <View style={styles.rowTextWrap}>
                <View style={styles.rowTitleWrap}>
                  <Text style={styles.rowTitle}>Push Notifications</Text>
                  {pushLoading && (
                    <ActivityIndicator
                      size="small"
                      color="#00DEAB"
                      style={{ marginLeft: 6 }}
                    />
                  )}
                </View>
                <Text style={styles.rowSub}>
                  Receive real-time alerts for task updates
                </Text>
              </View>
              <Switch
                value={pushEnabled}
                onValueChange={handlePushToggle}
                disabled={pushLoading}
                trackColor={{ false: "#E2E8F0", true: "#00DEAB" }}
                thumbColor="#FFFFFF"
                ios_backgroundColor="#E2E8F0"
              />
            </View>

            <View style={styles.divider} />

            <View style={styles.row}>
              <View style={styles.rowIconWrap}>
                <Ionicons
                  name="volume-medium-outline"
                  size={20}
                  color="#00DEAB"
                />
              </View>
              <View style={styles.rowTextWrap}>
                <Text style={styles.rowTitle}>Sound Effects</Text>
                <Text style={styles.rowSub}>
                  Play subtle audio chime on task actions
                </Text>
              </View>
              <Switch
                value={soundEnabled}
                onValueChange={setSoundEnabled}
                trackColor={{ false: "#E2E8F0", true: "#00DEAB" }}
                thumbColor="#FFFFFF"
                ios_backgroundColor="#E2E8F0"
              />
            </View>

            <View style={styles.divider} />

            {/* <View style={styles.row}>
              <View style={styles.rowIconWrap}>
                <Ionicons name="mail-outline" size={20} color="#00DEAB" />
              </View>
              <View style={styles.rowTextWrap}>
                <Text style={styles.rowTitle}>Email Summary</Text>
                <Text style={styles.rowSub}>
                  Daily digest of pending & due tasks
                </Text>
              </View>
              <Switch
                value={emailSummaryEnabled}
                onValueChange={setEmailSummaryEnabled}
                trackColor={{ false: "#E2E8F0", true: "#00DEAB" }}
                thumbColor="#FFFFFF"
                ios_backgroundColor="#E2E8F0"
              />
            </View> */}

            <View style={styles.divider} />

            <View style={styles.row}>
              <View style={styles.rowIconWrap}>
                <Ionicons
                  name="finger-print-outline"
                  size={20}
                  color="#00DEAB"
                />
              </View>
              <View style={styles.rowTextWrap}>
                <Text style={styles.rowTitle}>Haptic Feedback</Text>
                <Text style={styles.rowSub}>
                  Vibrate on swipe actions & task status change
                </Text>
              </View>
              <Switch
                value={hapticsEnabled}
                onValueChange={handleHapticsToggle}
                trackColor={{ false: "#E2E8F0", true: "#00DEAB" }}
                thumbColor="#FFFFFF"
                ios_backgroundColor="#E2E8F0"
              />
            </View>

            {hapticsEnabled && (
              <View style={styles.intensityContainer}>
                <Text style={styles.intensityLabel}>Vibration Strength</Text>
                <View style={styles.segmentedContainer}>
                  {(["Light", "Medium", "Heavy"] as HapticIntensity[]).map(
                    (level) => {
                      const active = hapticIntensity === level;
                      return (
                        <TouchableOpacity
                          key={level}
                          style={[
                            styles.segmentedBtn,
                            active && styles.segmentedBtnActive,
                          ]}
                          activeOpacity={0.8}
                          onPress={() => handleHapticIntensityChange(level)}
                        >
                          <Text
                            style={[
                              styles.segmentedBtnText,
                              active && styles.segmentedBtnTextActive,
                            ]}
                          >
                            {level}
                          </Text>
                        </TouchableOpacity>
                      );
                    },
                  )}
                </View>
              </View>
            )}
          </View>
        </View>

        {/* ── Section: Account & Security ── */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>ACCOUNT & SECURITY</Text>

          <View style={styles.card}>
            <View style={styles.row}>
              <View style={styles.rowIconWrap}>
                <Ionicons
                  name="finger-print-outline"
                  size={20}
                  color="#00DEAB"
                />
              </View>
              <View style={styles.rowTextWrap}>
                <Text style={styles.rowTitle}>Face ID / Biometric Login</Text>
                <Text style={styles.rowSub}>
                  Log in with Face ID or Fingerprint on startup
                </Text>
              </View>
              <Switch
                value={biometricsEnabled}
                onValueChange={handleBiometricToggle}
                trackColor={{ false: "#E2E8F0", true: "#00DEAB" }}
                thumbColor="#FFFFFF"
                ios_backgroundColor="#E2E8F0"
              />
            </View>

            <View style={styles.divider} />

            {/* <TouchableOpacity
              style={styles.clickableRow}
              activeOpacity={0.7}
              onPress={() => setPasswordModalVisible(true)}
            >
              <View style={styles.rowIconWrap}>
                <Ionicons
                  name="lock-closed-outline"
                  size={20}
                  color="#3B82F6"
                />
              </View>
              <View style={styles.rowTextWrap}>
                <Text style={styles.rowTitle}>Change Password</Text>
                <Text style={styles.rowSub}>
                  Update account security credentials
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity
              style={styles.clickableRow}
              activeOpacity={0.7}
              onPress={() =>
                showSuccess("Device session token is active & secure")
              }
            >
              <View style={styles.rowIconWrap}>
                <Ionicons
                  name="shield-checkmark-outline"
                  size={20}
                  color="#3B82F6"
                />
              </View>
              <View style={styles.rowTextWrap}>
                <Text style={styles.rowTitle}>Active Session</Text>
                <Text style={styles.rowSub}>
                  Logged in via Mobile App (Encrypted Token)
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
            </TouchableOpacity> */}
          </View>
        </View>

        {/* ── Section: Cache & Diagnostics ── */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>STORAGE & DIAGNOSTICS</Text>

          <View style={styles.card}>
            <TouchableOpacity
              style={styles.clickableRow}
              activeOpacity={0.7}
              onPress={handleClearCache}
            >
              <View style={styles.rowIconWrap}>
                <Ionicons name="trash-outline" size={20} color="#EF4444" />
              </View>
              <View style={styles.rowTextWrap}>
                <Text style={styles.rowTitle}>Clear Cache</Text>
                <Text style={styles.rowSub}>
                  {cacheCleared ? "0.0 KB (Cleaned)" : cacheSizeText}
                </Text>
              </View>
              <Text style={styles.actionLinkText}>Clear</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Section: System Info ── */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>ABOUT</Text>

          <View style={styles.card}>
            <View style={styles.row}>
              <View style={styles.rowIconWrap}>
                <Ionicons
                  name="information-circle-outline"
                  size={20}
                  color="#6B7280"
                />
              </View>
              <View style={styles.rowTextWrap}>
                <Text style={styles.rowTitle}>App Version</Text>
                <Text style={styles.rowSub}>v1.2.4 (Build 108)</Text>
              </View>
              <Text style={styles.tagText}>Latest</Text>
            </View>

            <View style={styles.divider} />

            {/* <View style={styles.row}>
              <View style={styles.rowIconWrap}>
                <Ionicons name="server-outline" size={20} color="#6B7280" />
              </View>
              <View style={styles.rowTextWrap}>
                <Text style={styles.rowTitle}>Environment</Text>
                <Text style={styles.rowSub}>Production (websouls-api)</Text>
              </View>
            </View> */}
          </View>
        </View>

        {/* ── Sign Out Button ── */}
        <TouchableOpacity
          style={styles.logoutButton}
          activeOpacity={0.85}
          onPress={handleLogout}
        >
          <MaterialCommunityIcons name="logout" size={20} color="#EF4444" />
          <Text style={styles.logoutButtonText}>Sign Out</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── Password Modal ── */}
      <Modal
        visible={passwordModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPasswordModalVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setPasswordModalVisible(false)}
        >
          <Pressable
            style={styles.modalCard}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Change Password</Text>
              <TouchableOpacity onPress={() => setPasswordModalVisible(false)}>
                <Ionicons name="close" size={22} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalLabel}>Current Password</Text>
            <TextInput
              style={styles.modalInput}
              secureTextEntry
              placeholder="Enter current password"
              value={oldPassword}
              onChangeText={setOldPassword}
            />

            <Text style={styles.modalLabel}>New Password</Text>
            <TextInput
              style={styles.modalInput}
              secureTextEntry
              placeholder="Enter new password"
              value={newPassword}
              onChangeText={setNewPassword}
            />

            <Text style={styles.modalLabel}>Confirm New Password</Text>
            <TextInput
              style={styles.modalInput}
              secureTextEntry
              placeholder="Confirm new password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
            />

            <TouchableOpacity
              style={styles.modalSaveBtn}
              activeOpacity={0.85}
              onPress={handlePasswordChange}
              disabled={updatingPassword}
            >
              {updatingPassword ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.modalSaveBtnText}>Update Password</Text>
              )}
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Redesigned Custom Confirmation Alert Modal ── */}
      <Modal
        visible={alertConfig.visible}
        transparent
        animationType="fade"
        onRequestClose={() =>
          setAlertConfig((prev) => ({ ...prev, visible: false }))
        }
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() =>
            setAlertConfig((prev) => ({ ...prev, visible: false }))
          }
        >
          <Pressable
            style={styles.alertCard}
            onPress={(e) => e.stopPropagation()}
          >
            <View
              style={[
                styles.alertIconBadge,
                { backgroundColor: alertConfig.iconBgColor },
              ]}
            >
              <Ionicons
                name={alertConfig.iconName}
                size={28}
                color={alertConfig.iconColor}
              />
            </View>

            <Text style={styles.alertTitle}>{alertConfig.title}</Text>
            <Text style={styles.alertDescription}>
              {alertConfig.description}
            </Text>

            <View style={styles.alertActionRow}>
              <TouchableOpacity
                style={styles.alertCancelBtn}
                activeOpacity={0.8}
                onPress={() =>
                  setAlertConfig((prev) => ({ ...prev, visible: false }))
                }
              >
                <Text style={styles.alertCancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.alertConfirmBtn,
                  { backgroundColor: alertConfig.confirmBgColor },
                ]}
                activeOpacity={0.85}
                onPress={alertConfig.onConfirm}
              >
                <Text style={styles.alertConfirmBtnText}>
                  {alertConfig.confirmText}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    gap: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitleWrap: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: "SF_Pro_Bold",
    color: "#1D1D1D",
  },
  headerSubtitle: {
    fontSize: 12,
    fontFamily: "SF_Pro_Regular",
    color: "#6B7280",
    marginTop: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 20,
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#1D1D1D",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  profileAvatarImg: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  avatarText: {
    color: "#FFFFFF",
    fontFamily: "SF_Pro_Bold",
    fontSize: 18,
  },
  profileInfo: {
    marginLeft: 12,
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontFamily: "SF_Pro_Bold",
    color: "#1D1D1D",
  },
  userRole: {
    fontSize: 12,
    fontFamily: "SF_Pro_Medium",
    color: "#00DEAB",
    marginTop: 2,
  },
  userEmail: {
    fontSize: 11,
    fontFamily: "SF_Pro_Regular",
    color: "#6B7280",
    marginTop: 2,
  },
  companyBadge: {
    backgroundColor: "#E6FBF7",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#B2F2E5",
  },
  companyBadgeText: {
    fontSize: 10,
    fontFamily: "SF_Pro_Semibold",
    color: "#00A881",
  },
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    fontSize: 11,
    fontFamily: "SF_Pro_Bold",
    color: "#6B7280",
    letterSpacing: 0.8,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  clickableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#F0FDF9",
    borderWidth: 1,
    borderColor: "#E0F8F2",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  rowTextWrap: {
    flex: 1,
    paddingRight: 8,
  },
  rowTitleWrap: {
    flexDirection: "row",
    alignItems: "center",
  },
  rowTitle: {
    fontSize: 14,
    fontFamily: "SF_Pro_Medium",
    color: "#1D1D1D",
  },
  rowSub: {
    fontSize: 12,
    fontFamily: "SF_Pro_Regular",
    color: "#6B7280",
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: "#F3F4F6",
    marginLeft: 64,
  },
  intensityContainer: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    paddingTop: 2,
  },
  intensityLabel: {
    fontSize: 12,
    fontFamily: "SF_Pro_Medium",
    color: "#6B7280",
    marginBottom: 8,
  },
  segmentedContainer: {
    flexDirection: "row",
    backgroundColor: "#F3F4F6",
    borderRadius: 10,
    padding: 3,
    gap: 4,
  },
  segmentedBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  segmentedBtnActive: {
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  segmentedBtnText: {
    fontSize: 12,
    fontFamily: "SF_Pro_Medium",
    color: "#6B7280",
  },
  segmentedBtnTextActive: {
    color: "#00DEAB",
    fontFamily: "SF_Pro_Bold",
  },
  actionLinkText: {
    fontSize: 13,
    fontFamily: "SF_Pro_Semibold",
    color: "#EF4444",
  },
  tagText: {
    fontSize: 11,
    fontFamily: "SF_Pro_Medium",
    color: "#10B981",
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FEF2F2",
    borderRadius: 12,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "#FCA5A5",
    gap: 8,
    marginTop: 4,
  },
  logoutButtonText: {
    fontSize: 14,
    fontFamily: "SF_Pro_Bold",
    color: "#EF4444",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  modalCard: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 16,
    fontFamily: "SF_Pro_Bold",
    color: "#1D1D1D",
  },
  modalLabel: {
    fontSize: 12,
    fontFamily: "SF_Pro_Medium",
    color: "#374151",
    marginBottom: 6,
    marginTop: 10,
  },
  modalInput: {
    height: 44,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    fontFamily: "SF_Pro_Regular",
    color: "#1D1D1D",
    backgroundColor: "#F9FAFB",
  },
  modalSaveBtn: {
    backgroundColor: "#00DEAB",
    borderRadius: 8,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
  },
  modalSaveBtnText: {
    color: "#FFFFFF",
    fontFamily: "SF_Pro_Bold",
    fontSize: 14,
  },
  alertCard: {
    width: "88%",
    maxWidth: 340,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  alertIconBadge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  alertTitle: {
    fontSize: 19,
    fontFamily: "SF_Pro_Bold",
    color: "#1D1D1D",
    textAlign: "center",
    marginBottom: 8,
  },
  alertDescription: {
    fontSize: 14,
    fontFamily: "SF_Pro_Regular",
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
  },
  alertActionRow: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  alertCancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  alertCancelBtnText: {
    fontSize: 15,
    fontFamily: "SF_Pro_Semibold",
    color: "#4B5563",
  },
  alertConfirmBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  alertConfirmBtnText: {
    fontSize: 15,
    fontFamily: "SF_Pro_Bold",
    color: "#FFFFFF",
  },
});
