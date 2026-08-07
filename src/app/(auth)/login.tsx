import FloatingInput from "@/components/FloatingInput";
import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import TopMintGlow from "@/components/gradientheader";
import { Colors } from "@/theme/root";
import { router } from "expo-router";
import Images from "@/constants/images";
import { useAuth } from "@/hooks/useAuth";
import { extractErrorMessage } from "@/utils/errorHandler";
import { showInfo, showError } from "@/utils/toast";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

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
          <View style={styles.content}>
          <Image
            source={Images.PlaintLogo}
            style={styles.logo}
            resizeMode="contain"
          />

          <Text style={styles.title}>Welcome back!</Text>

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
              <Text style={styles.loginBtnText}>Log In</Text>
            )}
          </Pressable>

          <TouchableOpacity onPress={() => router.replace("/(auth)/forgetpassword")}>
            <Text style={styles.forgotText}>Forgot Password?</Text>
          </TouchableOpacity>
          </View>
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
