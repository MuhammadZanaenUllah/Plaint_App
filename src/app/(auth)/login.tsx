import { FORM_MAX_WIDTH, rf } from "@/utils/responsive";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import FloatingInput from "@/components/FloatingInput";
import TopMintGlow from "@/components/gradientheader";
import Images from "@/constants/images";
import { useAuth } from "@/hooks/useAuth";
import { Colors } from "@/theme/root";
import { extractErrorMessage } from "@/utils/errorHandler";
import { getBiometricSession } from "@/utils/token";
import { showError, showInfo, showSuccess } from "@/utils/toast";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useRef, useState } from "react";
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

  // "Face ID" / "Fingerprint" when biometric login is on and usable on this
  // device; null hides the button.
  const [bioLabel, setBioLabel] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const biometricLogin = useCallback(
    async (label: string) => {
      try {
        // No usable saved login (expired or never saved): the scan would
        // succeed but have nothing to sign in with.
        if (!(await getBiometricSession())) {
          showInfo(
            "Sign in with password",
            `Sign in with your email and password once to use ${label} again.`,
          );
          return;
        }

        const res = await LocalAuthentication.authenticateAsync({
          promptMessage: `Sign in using ${label}`,
          fallbackLabel: "Use Password",
          cancelLabel: "Cancel",
        });
        if (!res.success || !mountedRef.current) return;

        setLoading(true);
        if (await restoreSession()) {
          showSuccess("Authenticated successfully!");
          router.replace("/(tabs)/tasks");
        } else {
          showInfo(
            "Session expired",
            "Please sign in with your email and password.",
          );
        }
      } catch (err) {
        console.warn("[Login] Biometric error:", err);
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    },
    [restoreSession],
  );

  useEffect(() => {
    mountedRef.current = true;

    async function setupBiometrics() {
      try {
        const enabled = await SecureStore.getItemAsync("pref_biometrics_enabled");
        if (enabled !== "true") return;
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();
        if (!hasHardware || !isEnrolled || !mountedRef.current) return;

        const types =
          await LocalAuthentication.supportedAuthenticationTypesAsync();
        const label = types.includes(
          LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION,
        )
          ? "Face ID"
          : "Fingerprint";
        if (!mountedRef.current) return;
        setBioLabel(label);

        // Auto-prompt only when there is a saved login to restore; the
        // button stays available to retry after a cancel or failure.
        if (await getBiometricSession()) await biometricLogin(label);
      } catch (err) {
        console.warn("[Login] Biometric setup error:", err);
      }
    }

    const timer = setTimeout(setupBiometrics, 300);
    return () => {
      mountedRef.current = false;
      clearTimeout(timer);
    };
  }, [biometricLogin]);

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

              {bioLabel && (
                <Pressable
                  style={[styles.bioBtn, loading && styles.loginBtnDisabled]}
                  onPress={() => biometricLogin(bioLabel)}
                  disabled={loading}
                >
                  <Ionicons
                    name={bioLabel === "Face ID" ? "scan-outline" : "finger-print"}
                    size={20}
                    color={Colors.bgButtonColor}
                  />
                  <Text allowFontScaling={false} style={styles.bioBtnText}>
                    Log in with {bioLabel}
                  </Text>
                </Pressable>
              )}

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
    width: "100%",
    maxWidth: FORM_MAX_WIDTH, // tablets: keep the form readable
    alignSelf: "center",
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
    fontSize: rf(28),
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
    fontSize: rf(16),
    fontFamily: "SF_Pro_Semibold",
    color: Colors.buttonText,
  },
  bioBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.bgButtonColor,
    borderRadius: 8,
    paddingVertical: 14,
    marginTop: 12,
  },
  bioBtnText: {
    fontSize: rf(16),
    fontFamily: "SF_Pro_Semibold",
    color: Colors.bgButtonColor,
  },
  forgotText: {
    textAlign: "center",
    fontSize: rf(14),
    color: Colors.buttonText,
    fontFamily: "SF_Pro_Semibold",
  },
});
