import {
    StyleSheet,
    View
} from 'react-native';
import { useContentWidth } from '@/utils/responsive';





export default function TopMintGlow() {
    // Centered in the content column (tablets), not the whole screen.
    const screenWidth = useContentWidth();
    const layers = 40;
    const size = Math.max(screenWidth * 1.5, 520);

    return (
        <View
            pointerEvents="none"
            style={[
                styles.topGlow,
                {
                    width: size,
                    height: size,
                    left: (screenWidth - size) / 2,
                    top: -size * 0.7,
                },
            ]}>
            {Array.from({ length: layers }).map((_, index) => {
                const layerSize = size * (1 - index / layers);

                return (
                    <View
                        key={index}
                        style={{
                            position: 'absolute',
                            width: layerSize,
                            height: layerSize,
                            borderRadius: layerSize / 2,
                            backgroundColor: '#00DFAB',
                            opacity: 0.015 + (index / layers) * 0.025,
                        }}
                    />
                );
            })}
        </View>
    );
}


const styles = StyleSheet.create({
    topGlow: {
        position: 'absolute',
        borderRadius: 999,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: -1,
    },
})
