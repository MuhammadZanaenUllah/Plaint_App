import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import FloatingInput from "@/components/FloatingInput";
import TopMintGlow from "@/components/gradientheader";
import Images from "@/constants/images";
import { useAuth } from "@/hooks/useAuth";
import { Colors } from "@/theme/root";
import { extractErrorMessage } from "@/utils/errorHandler";
import { showError, showInfo, showSuccess } from "@/utils/toast";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { login, restoreSession } = useAuth();

  // Prevent going back to protected screens when on Login screen
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        return true;
      };
      const subscription = BackHandler.addEventListener(
        "hardwareBackPress",
        onBackPress
      );
      return () => subscription.remove();
    }, [])
  );

  useEffect(() => {
    let isMounted = true;

    async function autoTriggerBiometrics() {
      try {
        const enabled = await SecureStore.getItemAsync("pref_biometrics_enabled");
        if (enabled !== "true" || !isMounted) return;

        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();

        if (!hasHardware || !isEnrolled || !isMounted) return;

        const types =
          await LocalAuthentication.supportedAuthenticationTypesAsync();
        const label = types.includes(
          LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION
        )
          ? "Face ID"
          : types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)
          ? "Fingerprint"
          : "Biometrics";

        const res = await LocalAuthentication.authenticateAsync({
          promptMessage: `Sign in using ${label}`,
          fallbackLabel: "Use Password",
          cancelLabel: "Cancel",
        });

        if (res.success && isMounted) {
          setLoading(true);
          await restoreSession();
          showSuccess("Authenticated successfully!");
          router.replace("/(tabs)/tasks");
        }
      } catch (err) {
        console.warn("[Login] Auto biometric error:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    const timer = setTimeout(() => {
      autoTriggerBiometrics();
    }, 300);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, []);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      showInfo("Validation", "Email and password are required.");
      return;
    }

    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch (error) {
      const msg = extractErrorMessage(error);
      showError("Login Failed", msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <TouchableWithoutFeedback onPress={() => Keyboard.dismiss()}>
      <View style={styles.root}>
        <TopMintGlow />

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.flex}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.content}>
              <Image
                source={Images.PlaintLogo}
                style={styles.logo}
                resizeMode="contain"
              />

              <Text allowFontScaling={false} style={styles.title}>
                Welcome back!
              </Text>

              <View>
                <FloatingInput
                  label="Enter your work email"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />

                <FloatingInput
                  label="Enter your password"
                  value={password}
                  onChangeText={setPassword}
                  secureToggle
                />
              </View>

              <Pressable
                style={[styles.loginBtn, loading && styles.loginBtnDisabled]}
                onPress={handleLogin}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator size="small" color={Colors.buttonText} />
                ) : (
                  <Text allowFontScaling={false} style={styles.loginBtnText}>
                    Log In
                  </Text>
                )}
              </Pressable>

              <TouchableOpacity
                onPress={() => router.replace("/(auth)/forgetpassword")}
              >
                <Text allowFontScaling={false} style={styles.forgotText}>
                  Forgot Password?
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  root: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
  },
  content: {
    paddingHorizontal: 20,
    paddingVertical: 24,
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
  loginBtnDisabled: {
    opacity: 0.7,
  },
  loginBtnText: {
    fontSize: 16,
    fontFamily: "SF_Pro_Semibold",
    color: Colors.buttonText,
  },
  forgotText: {
    textAlign: "center",
    fontSize: 14,
    color: Colors.buttonText,
    fontFamily: "SF_Pro_Semibold",
  },
});
