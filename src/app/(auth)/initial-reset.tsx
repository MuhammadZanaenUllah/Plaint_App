import FloatingInput from "@/components/FloatingInput";
import TopMintGlow from "@/components/gradientheader";
import { Colors } from "@/theme/root";
import { router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import Images from "@/constants/images";
import { useAuth } from "@/hooks/useAuth";
import { extractErrorMessage } from "@/utils/errorHandler";
import { showInfo, showError, showSuccess } from "@/utils/toast";

export default function InitialPasswordReset() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { state, setInitialPassword } = useAuth();

  const email = state.defaultPasswordEmail;

  const handleReset = async () => {
    if (!newPassword.trim() || !confirmPassword.trim()) {
      showInfo("Validation", "All fields are required.");
      return;
    }
    if (newPassword !== confirmPassword) {
      showInfo("Validation", "Passwords do not match.");
      return;
    }
    if (newPassword.length < 6) {
      showInfo("Validation", "Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    try {
      await setInitialPassword(email, newPassword, confirmPassword);
      showSuccess("Success", "Password updated. Please login with your new password.");
      setTimeout(() => router.replace("/(auth)/login"), 2000);
    } catch (error) {
      const msg = extractErrorMessage(error);
      showError("Error", msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <TouchableWithoutFeedback onPress={() => Keyboard.dismiss()}>
      <View style={styles.root}>
        <TopMintGlow />
        <View style={styles.content}>
          <Image
            source={Images.PlaintLogo}
            style={styles.logo}
            resizeMode="contain"
          />

          <Text style={styles.title}>Set New Password</Text>

          <View>
            <Text style={styles.emailText}>
              Your account uses a default password. Please set a new password to
              continue.
            </Text>

            <FloatingInput
              label="New Password"
              value={newPassword}
              onChangeText={setNewPassword}
              secureToggle
            />

            <FloatingInput
              label="Confirm Password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureToggle
            />
          </View>

          <Pressable
            style={[styles.loginBtn, loading && { opacity: 0.7 }]}
            onPress={handleReset}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color={Colors.buttonText} />
            ) : (
              <Text style={styles.loginBtnText}>Update Password</Text>
            )}
          </Pressable>

          <Pressable onPress={() => router.replace("/(auth)/login")}>
            <Text style={styles.backText}>Back to Sign In</Text>
          </Pressable>
        </View>
      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  content: {
    flex: 1,
    paddingHorizontal: 15,
    justifyContent: "center",
    gap: 16,
  },
  logo: {
    width: 160,
    height: 48,
    alignSelf: "center",
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontFamily: "SF_Pro_Regular",
    textAlign: "center",
    color: "#111",
    marginBottom: 16,
  },
  emailText: {
    fontFamily: "SF_Pro_Regular",
    color: "#1f7556",
    marginBottom: 8,
    backgroundColor: "#d6f3e9",
    borderRadius: 8,
    padding: 10,
    textAlign: "center",
    fontSize: 12,
  },
  loginBtn: {
    backgroundColor: Colors.bgButtonColor,
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 4,
  },
  loginBtnText: {
    fontSize: 16,
    fontFamily: "SF_Pro_Semibold",
    color: Colors.buttonText,
  },
  backText: {
    textAlign: "center",
    fontSize: 14,
    color: Colors.buttonText,
    fontFamily: "SF_Pro_Semibold",
  },
});
