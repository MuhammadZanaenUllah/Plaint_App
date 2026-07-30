//this is the splash screen 
import { useEffect, useRef } from "react";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Image, StyleSheet, View } from "react-native";
import * as SecureStore from "expo-secure-store";
import TopMintGlow from "@/components/gradientheader";
import BottomMintGlow from "@/components/gradientfooter";
import Images from "@/constants/images";
import { useAuth } from "@/hooks/useAuth";

const ONBOARDING_KEY = "hasCompletedOnboarding";

export default function SplashScreen() {
  const router = useRouter();
  const { state } = useAuth();
  const navigated = useRef(false);
  const timerDone = useRef(false);

  const checkAndNavigate = async () => {
    if (navigated.current) return;
    if (!timerDone.current) return;
    if (state.loading) return;

    navigated.current = true;

    const hasOnboarded = await SecureStore.getItemAsync(ONBOARDING_KEY);

    if (!hasOnboarded) {
      router.replace("/splashscreem");
    } else if (state.isAuthenticated) {
      router.replace("/(tabs)/tasks");
    } else {
      router.replace("/(auth)/login");
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      timerDone.current = true;
      checkAndNavigate();
    }, 5000);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (timerDone.current && !state.loading) {
      checkAndNavigate();
    }
  }, [state.loading, state.isAuthenticated]);

  return (
    <>
      <StatusBar style="dark" />
      <View style={styles.container}>
        <TopMintGlow />
        <Image
          source={Images.PlaintLogo}
          style={styles.logo}
          resizeMode="contain"
        />
        <BottomMintGlow />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  logo: {
    width: 160,
    height: 60,
  },
});
