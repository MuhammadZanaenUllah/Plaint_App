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
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import Images from "@/constants/images";
import { extractErrorMessage } from "@/utils/errorHandler";
import { showInfo, showError } from "@/utils/toast";
import * as authService from "@/services/api/auth.service";

export default function ForgetPassword() {
  const [emailAddress, setEmailAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSendReset = async () => {
    if (!emailAddress.trim()) {
      showInfo("Validation", "Email is required.");
      return;
    }

    setLoading(true);
    try {
      await authService.verifyEmail({ email: emailAddress.trim() });
      setSent(true);
    } catch (error) {
      const msg = extractErrorMessage(error);
      showError("Error", msg);
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
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
            <Text style={styles.title}>Check Your Email</Text>
            <View style={styles.emailSentBox}>
              <Text style={styles.emailSentText}>
                A password reset link has been sent to {emailAddress}. Please check
                your inbox.
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => router.replace("/(auth)/login")}
              style={styles.loginBtn}
            >
              <Text style={styles.loginBtnText}>Back to Sign In</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableWithoutFeedback>
    );
  }

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

          <Text style={styles.title}>Reset Password</Text>

          <View>
            <View>
              <Text style={styles.emailText}>
                Enter your Email and proceed to set a new password!
              </Text>
            </View>

            <FloatingInput
              label="Email Address"
              value={emailAddress}
              onChangeText={setEmailAddress}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          <Pressable
            style={[styles.loginBtn, loading && { opacity: 0.7 }]}
            onPress={handleSendReset}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color={Colors.buttonText} />
            ) : (
              <Text style={styles.loginBtnText}>Next</Text>
            )}
          </Pressable>

          <View style={styles.forgotText}>
            <Text style={styles.remember}>Remember it?</Text>
            <TouchableOpacity onPress={() => router.replace("/(auth)/login")}>
              <Text style={styles.signIn}>Signin</Text>
            </TouchableOpacity>
          </View>
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
  loginBtn: {
    backgroundColor: Colors.bgButtonColor,
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 4,
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
  emailSentBox: {
    backgroundColor: "#d6f3e9",
    borderRadius: 8,
    padding: 16,
    marginBottom: 8,
  },
  emailSentText: {
    fontFamily: "SF_Pro_Regular",
    color: "#1f7556",
    textAlign: "center",
    fontSize: 13,
    lineHeight: 20,
  },
  loginBtnText: {
    fontSize: 16,
    fontFamily: "SF_Pro_Semibold",
    color: Colors.buttonText,
  },
  signIn: {
    fontFamily: "SF_Pro_Semibold",
    color: "#00dfab",
  },
  remember: {
    fontSize: 14,
    color: Colors.buttonText,
    fontFamily: "SF_Pro_Medium",
  },
  forgotText: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 1,
  },
});
