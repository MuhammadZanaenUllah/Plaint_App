import React from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";


export default function BottomMintGlow() {
  const { width: screenWidth } = useWindowDimensions();
  const layers = 45;
  const size = Math.max(screenWidth * 1.5, 520);

  return (
    <View
      pointerEvents="none"
      style={[
        styles.bottomGlow,
        {
          width: size,
          height: size,
          left: (screenWidth - size) / 2,

          // Push the circle below the screen
          bottom: -size * 0.7,
        },
      ]}
    >
      {Array.from({ length: layers }).map((_, index) => {
        const layerSize = size * (1 - index / layers);

        return (
          <View
            key={index}
            style={{
              position: "absolute",
              width: layerSize,
              height: layerSize,
              borderRadius: layerSize / 2,
              backgroundColor: "#00DFAB",

              // Soft fade
              opacity: 0.015 + (index / layers) * 0.03,
            }}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bottomGlow: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    zIndex: -1,
  },
});