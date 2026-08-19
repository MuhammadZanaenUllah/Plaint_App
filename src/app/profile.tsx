import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  SafeAreaView,
  StatusBar,
} from "react-native";
import { useAuth } from "@/hooks/useAuth";
import { getUserAvatarUrl } from "@/utils/userHelpers";
import { Ionicons, Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { Colors } from "@/theme/root";

// ─── Data ────────────────────────────────────────────────────────────────────

const personalInfo = [
  {
    id: "name",
    icon: "person-outline" as const,
    label: "Name",
    value: "Muhammad Hamza",
    iconLib: "Ionicons",
  },
  {
    id: "employee-id",
    icon: "badge-account-outline",
    label: "Employee ID",
    value: "EMP-1002",
    iconLib: "MaterialCommunity",
  },
  {
    id: "department",
    icon: "briefcase-outline" as const,
    label: "Department",
    value: "Software Development",
    iconLib: "Ionicons",
  },
  {
    id: "designation",
    icon: "person-circle-outline" as const,
    label: "Designation",
    value: "Frontend Developer",
    iconLib: "Ionicons",
  },
  {
    id: "join-date",
    icon: "calendar-outline" as const,
    label: "Join Date",
    value: "17 Dec 2025",
    iconLib: "Ionicons",
  },
];

const contactInfo = [
  {
    id: "phone",
    icon: "call-outline" as const,
    label: "Phone",
    value: "+92 XXX XXXXXXX",
    iconLib: "Ionicons",
  },
  {
    id: "email",
    icon: "mail-outline" as const,
    label: "Email",
    value: "hamza@email.com",
    iconLib: "Ionicons",
  },
  {
    id: "location",
    icon: "location-outline" as const,
    label: "Location",
    value: "Lahore, Pakistan",
    iconLib: "Ionicons",
  },
];

const accountItems = [
  { id: "change-password", icon: "lock-closed-outline" as const, label: "Change Password" },
  { id: "notifications", icon: "notifications-outline" as const, label: "Notifications" },
  { id: "privacy", icon: "shield-checkmark-outline" as const, label: "Privacy" },
  { id: "language", icon: "globe-outline" as const, label: "Language" },
];

// ─── Row Components ───────────────────────────────────────────────────────────

function InfoRow({
  icon,
  label,
  value,
  isLast = false,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  value: string;
  isLast?: boolean;
}) {
  return (
    <View style={[styles.infoRow, !isLast && styles.infoRowBorder]}>
      <View style={styles.infoLeft}>
        <View style={styles.iconWrap}>
          <Ionicons name={icon} size={18} color={Colors.primary} />
        </View>
        <Text style={styles.infoLabel}>{label}</Text>
      </View>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function AccountRow({
  icon,
  label,
  isLast = false,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  isLast?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.infoRow, !isLast && styles.infoRowBorder]}
      activeOpacity={0.7}
    >
      <View style={styles.infoLeft}>
        <View style={styles.iconWrap}>
          <Ionicons name={icon} size={18} color={Colors.primary} />
        </View>
        <Text style={styles.infoLabel}>{label}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color="#BCBCBC" />
    </TouchableOpacity>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function Profile() {
  const { state: authState } = useAuth();
  const user = authState.user;
  const [profileImage, setProfileImage] = useState<string | null>(null);

  const pickImage = useCallback(async () => {
    // Request permission
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });

    if (!result.canceled && result.assets.length > 0) {
      setProfileImage(result.assets[0].uri);
    }
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {/* ── Header ── */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color="#1D1D1D" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Profile</Text>
        <View style={styles.topBarRight}>
          <TouchableOpacity style={styles.topBarIcon} activeOpacity={0.7}>
            <Ionicons name="settings-outline" size={22} color="#1D1D1D" />
          </TouchableOpacity>
          {/* <TouchableOpacity style={styles.topBarIcon} activeOpacity={0.7}>
            <View style={styles.bellWrap}>
              <Ionicons name="notifications-outline" size={22} color="#1D1D1D" />
              <View style={styles.bellDot} />
            </View>
          </TouchableOpacity>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>JD</Text>
          </View> */}
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Avatar Section ── */}
        <View style={styles.avatarSection}>
          {/* Profile ring + camera button */}
          <View style={styles.profileRingContainer}>
            <View style={styles.profileRing}>
              <View style={styles.profileImageWrap}>
                <Image
                  source={{ uri: profileImage || getUserAvatarUrl(user) }}
                  style={styles.profileImageFull}
                  resizeMode="cover"
                />
              </View>
            </View>

            {/* Camera / edit button at bottom-right */}
            <TouchableOpacity
              style={styles.cameraBtn}
              onPress={pickImage}
              activeOpacity={0.8}
            >
              <Ionicons name="camera" size={14} color="#fff" />
            </TouchableOpacity>
          </View>
          <Text style={styles.profileName}>Muhammad Hamza</Text>
          <Text style={styles.profileRole}>Frontend Developer</Text>
          <View style={styles.contactQuickRow}>
            <View style={styles.contactQuickItem}>
              <View style={styles.iconWrap}>
                <Ionicons name="mail-outline" size={15} color={Colors.primary} />
              </View>
              <Text style={styles.contactQuickText}>hamza@email.com</Text>
            </View>
          </View>
          <View style={styles.contactQuickRow}> 
            <View style={styles.contactQuickItem}>
              <View style={styles.iconWrap}>
                <Ionicons name="call-outline" size={15} color={Colors.primary} />
              </View>
              <Text style={styles.contactQuickText}>+92 XXX XXXXXXX</Text>
            </View>
          </View>
        </View>

        {/* ── Personal Information ── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Personal Information</Text>
          <InfoRow
            icon="person-outline"
            label="Name"
            value="Muhammad Hamza"
          />
          <InfoRow
            icon="id-card-outline"
            label="Employee ID"
            value="EMP-1002"
          />
          <InfoRow
            icon="briefcase-outline"
            label="Department"
            value="Software Development"
          />
          <InfoRow
            icon="person-circle-outline"
            label="Designation"
            value="Frontend Developer"
          />
          <InfoRow
            icon="calendar-outline"
            label="Join Date"
            value="17 Dec 2025"
            isLast
          />
        </View>

        {/* ── Contact Information ── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Contact Information</Text>
          <InfoRow
            icon="call-outline"
            label="Phone"
            value="+92 XXX XXXXXXX"
          />
          <InfoRow
            icon="mail-outline"
            label="Email"
            value="hamza@email.com"
          />
          <InfoRow
            icon="location-outline"
            label="Location"
            value="Lahore, Pakistan"
            isLast
          />
        </View>

        {/* ── Account ── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Account</Text>
          <AccountRow icon="lock-closed-outline" label="Change Password" />
          <AccountRow icon="notifications-outline" label="Notifications" />
          <AccountRow icon="shield-checkmark-outline" label="Privacy" />
          <AccountRow icon="globe-outline" label="Language" isLast />
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>

      {/* ── Settings & Logout ── */}
      <View style={styles.logoutWrap}>
        <TouchableOpacity
          style={[styles.logoutBtn, { backgroundColor: "#F3F4F6", marginBottom: 10 }]}
          activeOpacity={0.85}
          onPress={() => router.push("/settings")}
        >
          <Ionicons name="settings-outline" size={20} color="#1D1D1D" />
          <Text style={[styles.logoutText, { color: "#1D1D1D" }]}>App Settings</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.logoutBtn} activeOpacity={0.85} onPress={() => router.replace("/login")}>
          <Feather name="log-out" size={20} color="#fff" />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#FFF",
  },

  // Top bar
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#fff",
  },
  backBtn: {
    marginRight: 8,
  },
  topBarTitle: {
    flex: 1,
    fontSize: 20,
    fontFamily: "SF_Pro_Bold",
    color: "#1D1D1D",
  },
  topBarRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  topBarIcon: {
    justifyContent: "center",
    alignItems: "center",
  },
  bellWrap: {
    position: "relative",
  },
  bellDot: {
    position: "absolute",
    top: -1,
    right: -1,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
    borderWidth: 1.5,
    borderColor: "#fff",
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: "#1D1D1D",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    color: "#fff",
    fontFamily: "SF_Pro_Bold",
    fontSize: 12,
  },

  // Scroll
  scroll: {
    flex: 1,
  },
  scrollContent: {
    // paddingBottom: 12,
  },

  // Avatar / hero section
  avatarSection: {
    backgroundColor: "#fff",
    alignItems: "center",
    paddingTop: 24,
    paddingBottom: 24,
    marginBottom: 12,
  },
  // Profile ring container (for positioning the camera badge)
  profileRingContainer: {
    position: "relative",
    marginBottom: 14,
  },
  profileRing: {
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 2.5,
    borderColor: Colors.primary,
    justifyContent: "center",
    alignItems: "center",
    padding: 3,
  },
  profileImageWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    overflow: "hidden",
    backgroundColor: "#F0F0F0",
    justifyContent: "center",
    alignItems: "center",
  },
  profileImageFull: {
    width: 96,
    height: 96,
    borderRadius: 48,
  },
  profileImagePlaceholder: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "#EBEBEB",
    justifyContent: "center",
    alignItems: "center",
  },
  // Camera badge
  cameraBtn: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  profileName: {
    fontSize: 20,
    fontFamily: "SF_Pro_Bold",
    color: "#1D1D1D",
    marginBottom: 4,
  },
  profileRole: {
    fontSize: 13,
    fontFamily: "SF_Pro_Regular",
    color: "#6B6B6B",
    marginBottom: 10,
  },
  contactQuickRow: {
    marginBottom: 4,
    alignItems: "center",
  },
  contactQuickItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  contactQuickText: {
    fontSize: 13,
    fontFamily: "SF_Pro_Regular",
    color: "#1D1D1D",
  },

  // Card
  card: {
    backgroundColor: "#fff",
    marginHorizontal: 14,
    marginBottom: 12,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  cardTitle: {
    fontSize: 15,
    fontFamily: "SF_Pro_Semibold",
    color: "#1D1D1D",
    marginBottom: 12,
  },

  // Info row
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
  },
  infoRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  infoLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#F0FBF7",
    justifyContent: "center",
    alignItems: "center",
  },
  infoLabel: {
    fontSize: 14,
    fontFamily: "SF_Pro_Regular",
    color: "#1D1D1D",
  },
  infoValue: {
    fontSize: 13,
    fontFamily: "SF_Pro_Regular",
    color: "#6B6B6B",
    flexShrink: 1,
    textAlign: "right",
    marginLeft: 8,
  },

  // Logout
  logoutWrap: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    paddingTop: 0,
    // backgroundColor: "#F5F5F5",
  },
  logoutBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    height: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  logoutText: {
    fontSize: 16,
    fontFamily: "SF_Pro_Semibold",
    color: "#fff",
  },
});