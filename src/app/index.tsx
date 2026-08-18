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
import useAppFonts from "@/theme/useAppFonts";

const ONBOARDING_KEY = "hasCompletedOnboarding";

export default function SplashScreen() {
  const router = useRouter();
  const { state } = useAuth();
  const [fontsLoaded] = useAppFonts();
  const navigated = useRef(false);
  const timerDone = useRef(false);
  // The 5s timer effect below only runs once (on mount) and its closure
  // over checkAndNavigate is frozen at that point — fontsLoaded and
  // state.loading are still stale there when the timeout fires later. Mirror
  // them into refs (like navigated/timerDone) so checkAndNavigate always
  // reads their current value regardless of which closure calls it.
  const fontsLoadedRef = useRef(fontsLoaded);
  const authStateRef = useRef(state);
  fontsLoadedRef.current = fontsLoaded;
  authStateRef.current = state;

  const checkAndNavigate = async () => {
    if (navigated.current) return;
    if (!timerDone.current) return;
    if (authStateRef.current.loading) return;
    if (!fontsLoadedRef.current) return;

    navigated.current = true;

    const hasOnboarded = await SecureStore.getItemAsync(ONBOARDING_KEY);

    if (!hasOnboarded) {
      router.replace("/splashscreem");
    } else if (authStateRef.current.isAuthenticated) {
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
    if (timerDone.current && !state.loading && fontsLoaded) {
      checkAndNavigate();
    }
  }, [state.loading, state.isAuthenticated, fontsLoaded]);

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
