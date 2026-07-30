//this is the onboarding screen 
import TopMintGlow from "@/components/gradientheader";
import { Colors } from "@/theme/root";
import useAppFonts from "@/theme/useAppFonts";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useEffect, useRef, useState } from "react";
import {
  Dimensions,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import Images from "@/constants/images";

const { width: SW } = Dimensions.get("window");

const SLIDES = [
  Images.MainBanner,
  Images.MainBanner,
  Images.MainBanner,
  Images.MainBanner,
];


function Dots({ active }: { active: number }) {
  return (
    <View style={styles.dotsRow}>
      {SLIDES.map((_, i) => (
        <View key={i} style={[styles.dot, i === active && styles.dotActive]} />
      ))}
    </View>
  );
}

export default function OnboardingScreen() {
  const scrollRef = useRef<ScrollView>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const [active, setActive] = useState(0);

  // useEffect(() => {
  //   const interval = setInterval(() => {
  //     setActive((prev) => {
  //       const next = (prev + 1) % SLIDES.length;
  //       scrollRef.current?.scrollTo({ x: next * SW, animated: true });
  //       return next;
  //     });
  //   }, 2500);
  //   return () => clearInterval(interval);
  // }, []);

  useEffect(() => {
    startAutoSlide();

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const startAutoSlide = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    intervalRef.current = setInterval(() => {
      setActive((prev) => {
        const next = (prev + 1) % SLIDES.length;

        scrollRef.current?.scrollTo({
          x: next * SW,
          animated: true,
        });

        return next;
      });
    }, 2500);
  };
  const [fontsLoaded] = useAppFonts();

  if (!fontsLoaded) return null;

  return (
    <View style={styles.root}>
      {/* <StatusBar style="dark" /> */}

      {/* Top half: gradient bg + slider */}
      <View style={styles.topHalf}>

        <TopMintGlow />
        {/* <LinearGradient
          colors={["#B8F0E6", "#D8FAF3", "#F0FEFA"]}
          locations={[0, 0.5, 1]}
          style={StyleSheet.absoluteFill}
        /> */}
        <View />

        {/* <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEnabled={false}
          style={styles.slider}
        >
          {SLIDES.map((src, i) => (
            <View key={i} style={styles.slide}>
              <Image source={src} style={styles.bannerImage} resizeMode="contain" />
            </View>
          ))}
        </ScrollView> */}

        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEnabled
          style={styles.slider}
          contentContainerStyle={{ flexGrow: 1 }}
          onMomentumScrollEnd={(e) => {
            const index = Math.round(
              e.nativeEvent.contentOffset.x / SW
            );

            setActive(index);
            startAutoSlide();
          }}
        >
          {SLIDES.map((src, i) => (
            <View key={i} style={styles.slide}>
              <Image source={src} style={styles.bannerImage} resizeMode="contain" />
            </View>
          ))}
        </ScrollView>
      </View>

      {/* Bottom half */}
      <View style={styles.bottomHalf}>
        <Dots active={active} />
        <Text style={styles.headline}>Work Smarter, Together</Text>
        <Text style={styles.description}>
          Plan projects, manage tasks, track progress, and collaborate with your
          team in one powerful workspace. Stay organized, meet deadlines, and
          turn ideas into results anytime, anywhere.
        </Text>
        <TouchableOpacity
          style={styles.ctaGradient}
          activeOpacity={0.85}
          onPress={async () => {
            await SecureStore.setItemAsync("hasCompletedOnboarding", "true");
            router.replace("/(auth)/login");
          }}
        >
          <Text style={styles.ctaText}>Get Started</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#FFFFFF" },
  topHalf: {
    flex: 1.15,
    overflow: "hidden",
  },
  // circleHalo: {
  //   position: "absolute",
  //   width: SW * 0.82,
  //   height: SW * 0.82,
  //   borderRadius: SW * 0.41,
  //   // backgroundColor: "rgba(0,222,171,0.07)",
  //   borderWidth: 1,
  //   // borderColor: "rgba(0,222,171,0.13)",
  //   alignSelf: "center",
  //   top: SW * 0.08,
  //   zIndex: 0,
  // },
  slider: { flex: 1 },
  slide: {
    width: SW,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  bannerImage: {
    width: "100%",
    height: "100%",
  },
  bottomHalf: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 15,
    paddingTop: 20,
    paddingBottom: 36,
  },
  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
    gap: 20,
  },
  dot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: "#E6E6E6" },
  dotActive: { backgroundColor: "#000000", width: 7, height: 7 },
  headline: {
    fontSize: 22,
    // fontWeight: "800",
    color: "#1a1a1a",
    fontFamily: "SF_Pro_Semibold",
    textAlign: "center",
    marginBottom: 12,
    letterSpacing: -0.3,
  },
  description: {
    fontSize: 12.3,
    color: "#6B7280",
    fontFamily: "SF_Pro_Medium",
    textAlign: "center",
    lineHeight: 21,
    marginBottom: 28,
  },
  // ctaButton: {
  //   borderRadius: 16,
  //   overflow: "hidden",
  //   shadowColor: "#00DEAB",
  //   shadowOpacity: 0.4,
  //   shadowRadius: 14,
  //   shadowOffset: { width: 0, height: 5 },
  //   elevation: 10,
  // },
  ctaGradient: {
    paddingVertical: 18,
    backgroundColor: Colors.bgButtonColor,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaText: {
    fontSize: 17,
    // fontWeight: "900",
    fontFamily: "SF_Pro_Bold",
    color: Colors.buttonText,
    letterSpacing: 0.3,
  },
});
