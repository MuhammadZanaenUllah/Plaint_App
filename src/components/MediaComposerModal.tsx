import { rf } from "@/utils/responsive";
import { showError } from "@/utils/toast";
import { Ionicons } from "@expo/vector-icons";
import {
  SaveFormat,
  manipulateAsync,
} from "expo-image-manipulator";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Reanimated, {
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type ComposerFile = {
  uri: string;
  name: string;
  /** MIME type, e.g. "image/jpeg" / "application/pdf". */
  type: string;
  size?: number;
  width?: number;
  height?: number;
  kind: "image" | "video" | "document";
};

type Props = {
  files: ComposerFile[];
  onSend: (files: ComposerFile[], caption: string) => void;
  onCancel: () => void;
};

// ─── Crop view (pinch/pan the image inside a fixed square frame) ──────────────

function CropView({
  uri,
  onCancel,
  onDone,
}: {
  uri: string;
  onCancel: () => void;
  onDone: (result: { uri: string; width: number; height: number }) => void;
}) {
  const { width: screenW, height: screenH } = Dimensions.get("window");
  const insets = useSafeAreaInsets();
  const frame = Math.min(screenW, screenH * 0.62);
  const [imageSize, setImageSize] = useState<{ w: number; h: number } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);

  // Resolve the rendered image dimensions so the crop math maps 1:1 to what is
  // shown on screen.
  useEffect(() => {
    let cancelled = false;
    Image.getSize(
      uri,
      (w, h) => {
        if (!cancelled && w > 0 && h > 0) setImageSize({ w, h });
      },
      () => {
        if (!cancelled) setImageSize({ w: screenW, h: screenW });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [uri, screenW]);

  const imgW = imageSize?.w ?? screenW;
  const imgH = imageSize?.h ?? screenW;
  // Baseline "cover" scale so the image always fills the crop frame.
  const baseScale = Math.max(frame / imgW, frame / imgH);
  const baseW = imgW * baseScale;
  const baseH = imgH * baseScale;

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.max(1, savedScale.value * e.scale);
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      const maxX = Math.max(0, (baseW * scale.value - frame) / 2);
      const maxY = Math.max(0, (baseH * scale.value - frame) / 2);
      tx.value = Math.min(maxX, Math.max(-maxX, tx.value));
      ty.value = Math.min(maxY, Math.max(-maxY, ty.value));
      savedTx.value = tx.value;
      savedTy.value = ty.value;
    });

  const pan = Gesture.Pan()
    .maxPointers(1)
    .onUpdate((e) => {
      tx.value = savedTx.value + e.translationX;
      ty.value = savedTy.value + e.translationY;
    })
    .onEnd(() => {
      const maxX = Math.max(0, (baseW * scale.value - frame) / 2);
      const maxY = Math.max(0, (baseH * scale.value - frame) / 2);
      tx.value = Math.min(maxX, Math.max(-maxX, tx.value));
      ty.value = Math.min(maxY, Math.max(-maxY, ty.value));
      savedTx.value = tx.value;
      savedTy.value = ty.value;
    });

  const gesture = Gesture.Simultaneous(pinch, pan);

  const outerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }],
  }));
  const innerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handleDone = async () => {
    if (!imageSize || busy) return;
    setBusy(true);
    try {
      const total = baseScale * scale.value;
      const dispW = baseW * scale.value;
      const dispH = baseH * scale.value;
      const size = frame / total;
      const originX = Math.max(
        0,
        Math.min(imgW - size, (dispW / 2 - frame / 2 - tx.value) / total),
      );
      const originY = Math.max(
        0,
        Math.min(imgH - size, (dispH / 2 - frame / 2 - ty.value) / total),
      );
      const width = Math.min(imgW - originX, size);
      const height = Math.min(imgH - originY, size);
      const result = await manipulateAsync(
        uri,
        [{ crop: { originX, originY, width, height } }],
        { compress: 0.9, format: SaveFormat.JPEG },
      );
      onDone({
        uri: result.uri,
        width: result.width,
        height: result.height,
      });
    } catch (err) {
      console.log("[Composer] Crop failed:", err);
      showError("Error", "Could not crop the image.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={cropStyles.root}>
      <View
        style={[cropStyles.header, { paddingTop: insets.top + 10 }]}
      >
        <TouchableOpacity onPress={onCancel} hitSlop={10} disabled={busy}>
          <Ionicons name="close" size={26} color="#fff" />
        </TouchableOpacity>
        <Text style={cropStyles.title}>Crop</Text>
        <TouchableOpacity onPress={handleDone} hitSlop={10} disabled={busy}>
          {busy ? (
            <ActivityIndicator size="small" color="#00DEAB" />
          ) : (
            <Ionicons name="checkmark" size={26} color="#00DEAB" />
          )}
        </TouchableOpacity>
      </View>

      <View style={cropStyles.frameArea}>
        {imageSize ? (
          <GestureDetector gesture={gesture}>
            <View
              style={{
                width: frame,
                height: frame,
                overflow: "hidden",
                backgroundColor: "#000",
              }}
            >
              <Reanimated.View
                style={[StyleSheet.absoluteFill, cropStyles.center, outerStyle]}
              >
                <Reanimated.View
                  style={[{ width: baseW, height: baseH }, innerStyle]}
                >
                  <Image
                    source={{ uri }}
                    style={{ width: baseW, height: baseH }}
                    resizeMode="cover"
                  />
                </Reanimated.View>
              </Reanimated.View>
            </View>
          </GestureDetector>
        ) : (
          <ActivityIndicator size="large" color="#00DEAB" />
        )}
      </View>

      <Text style={[cropStyles.hint, { paddingBottom: insets.bottom + 24 }]}>
        Pinch to zoom · drag to reposition
      </Text>
    </View>
  );
}

// ─── Composer ─────────────────────────────────────────────────────────────────

export default function MediaComposerModal({ files, onSend, onCancel }: Props) {
  const { width: screenW } = Dimensions.get("window");
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<ComposerFile[]>(files);
  const [index, setIndex] = useState(0);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [cropUri, setCropUri] = useState<string | null>(null);
  const listRef = useRef<FlatList<ComposerFile>>(null);

  const mediaItems = useMemo(
    () => items.filter((f) => f.kind === "image" || f.kind === "video"),
    [items],
  );
  const isMedia = mediaItems.length > 0;
  const current = isMedia
    ? mediaItems[Math.min(index, mediaItems.length - 1)]
    : items[0];
  const canEditImage = current?.kind === "image";

  const updateCurrent = (patch: Partial<ComposerFile>) => {
    const target = current;
    if (!target) return;
    setItems((prev) =>
      prev.map((f) => (f.uri === target.uri ? { ...f, ...patch } : f)),
    );
  };

  const toJpegName = (name: string) => {
    const base = name.replace(/\.[^./\\]+$/, "");
    return `${base || "image"}.jpg`;
  };

  const handleRotate = async () => {
    if (!current || current.kind !== "image" || busy) return;
    setBusy(true);
    try {
      const result = await manipulateAsync(
        current.uri,
        [{ rotate: 90 }],
        { compress: 0.9, format: SaveFormat.JPEG },
      );
      updateCurrent({
        uri: result.uri,
        width: result.width,
        height: result.height,
        name: toJpegName(current.name),
        type: "image/jpeg",
      });
    } catch (err) {
      console.log("[Composer] Rotate failed:", err);
      showError("Error", "Could not rotate the image.");
    } finally {
      setBusy(false);
    }
  };

  const handleCropDone = (result: {
    uri: string;
    width: number;
    height: number;
  }) => {
    if (current) {
      updateCurrent({
        uri: result.uri,
        width: result.width,
        height: result.height,
        name: toJpegName(current.name),
        type: "image/jpeg",
      });
    }
    setCropUri(null);
  };

  const handleSend = () => {
    if (busy) return;
    onSend(items, caption);
  };

  const renderMedia = ({ item }: { item: ComposerFile }) => (
    <View style={{ width: screenW, height: "100%" }}>
      {item.kind === "image" ? (
        <Image
          source={{ uri: item.uri }}
          style={composerStyles.previewImage}
          resizeMode="contain"
        />
      ) : (
        <View style={composerStyles.videoPlaceholder}>
          <Ionicons name="videocam" size={44} color="#fff" />
          <Text style={composerStyles.videoName} numberOfLines={2}>
            {item.name}
          </Text>
        </View>
      )}
    </View>
  );

  return (
    <Modal
      visible
      animationType="slide"
      transparent={false}
      statusBarTranslucent
      onRequestClose={onCancel}
    >
      <GestureHandlerRootView style={composerStyles.root}>
        {cropUri ? (
          <CropView
            uri={cropUri}
            onCancel={() => setCropUri(null)}
            onDone={handleCropDone}
          />
        ) : (
          <KeyboardAvoidingView
            style={composerStyles.flex}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            {/* Top bar */}
            <View
              style={[composerStyles.topBar, { paddingTop: insets.top + 10 }]}
            >
              <TouchableOpacity onPress={onCancel} hitSlop={10}>
                <Ionicons
                  name={isMedia ? "arrow-back" : "close"}
                  size={24}
                  color="#fff"
                />
              </TouchableOpacity>
              <View style={composerStyles.topActions}>
                {canEditImage ? (
                  <>
                    <TouchableOpacity
                      onPress={handleRotate}
                      hitSlop={10}
                      disabled={busy}
                      style={composerStyles.topActionBtn}
                    >
                      <Ionicons
                        name="refresh-outline"
                        size={20}
                        color="#fff"
                        style={{ transform: [{ scaleX: -1 }] }}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setCropUri(current.uri)}
                      hitSlop={10}
                      disabled={busy}
                      style={composerStyles.topActionBtn}
                    >
                      <Ionicons name="crop-outline" size={20} color="#fff" />
                    </TouchableOpacity>
                  </>
                ) : null}
                {busy ? (
                  <ActivityIndicator
                    size="small"
                    color="#fff"
                    style={composerStyles.topActionBtn}
                  />
                ) : null}
              </View>
            </View>

            {/* Preview area */}
            {isMedia ? (
              <View style={composerStyles.flex}>
                <FlatList
                  ref={listRef}
                  style={composerStyles.flex}
                  data={mediaItems}
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  keyExtractor={(item, i) => `${item.uri}-${i}`}
                  renderItem={renderMedia}
                  getItemLayout={(_, i) => ({
                    length: screenW,
                    offset: screenW * i,
                    index: i,
                  })}
                  onMomentumScrollEnd={(e) => {
                    const i = Math.round(
                      e.nativeEvent.contentOffset.x / screenW,
                    );
                    setIndex(Math.max(0, Math.min(i, mediaItems.length - 1)));
                  }}
                />
                {mediaItems.length > 1 ? (
                  <View style={composerStyles.counter}>
                    <Text style={composerStyles.counterText}>
                      {`${Math.min(index + 1, mediaItems.length)} / ${mediaItems.length}`}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : (
              <View style={composerStyles.docArea}>
                {items.map((doc, i) => (
                  <View key={`${doc.uri}-${i}`} style={composerStyles.docCard}>
                    <View style={composerStyles.docIcon}>
                      <Ionicons
                        name="document-text"
                        size={26}
                        color="#00A67E"
                      />
                    </View>
                    <View style={composerStyles.docInfo}>
                      <Text style={composerStyles.docName} numberOfLines={2}>
                        {doc.name}
                      </Text>
                      <Text style={composerStyles.docMeta} numberOfLines={1}>
                        {[doc.type, formatBytes(doc.size)]
                          .filter(Boolean)
                          .join(" · ")}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Caption + send */}
            <View
              style={[
                composerStyles.bottomBar,
                { paddingBottom: Math.max(insets.bottom, 10) },
              ]}
            >
              <TextInput
                style={composerStyles.captionInput}
                value={caption}
                onChangeText={setCaption}
                placeholder="Add a caption..."
                placeholderTextColor="#9CA3AF"
                multiline
                maxLength={1000}
              />
              <TouchableOpacity
                style={[
                  composerStyles.sendBtn,
                  busy && composerStyles.sendBtnDisabled,
                ]}
                activeOpacity={0.85}
                onPress={handleSend}
                disabled={busy}
              >
                {busy ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="send" size={18} color="#fff" />
                )}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        )}
      </GestureHandlerRootView>
    </Modal>
  );
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  const k = 1024;
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), units.length - 1);
  const value = bytes / Math.pow(k, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

const cropStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingBottom: 8,
  },
  title: {
    color: "#fff",
    fontSize: rf(15),
    fontFamily: "SF_Pro_Semibold",
  },
  frameArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  center: { alignItems: "center", justifyContent: "center" },
  hint: {
    color: "#9CA3AF",
    fontSize: rf(11),
    fontFamily: "SF_Pro_Regular",
    textAlign: "center",
    paddingBottom: 40,
  },
});

const composerStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  flex: { flex: 1 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  topActions: { flexDirection: "row", alignItems: "center", gap: 18 },
  topActionBtn: { padding: 2 },
  previewImage: { width: "100%", height: "100%" },
  videoPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 24,
  },
  videoName: {
    color: "#fff",
    fontSize: rf(13),
    fontFamily: "SF_Pro_Medium",
    textAlign: "center",
  },
  counter: {
    position: "absolute",
    top: 12,
    alignSelf: "center",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  counterText: {
    color: "#fff",
    fontSize: rf(12),
    fontFamily: "SF_Pro_Medium",
  },
  docArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 12,
  },
  docCard: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    padding: 14,
    gap: 12,
  },
  docIcon: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: "#E6FBF5",
    alignItems: "center",
    justifyContent: "center",
  },
  docInfo: { flex: 1 },
  docName: {
    fontSize: rf(14),
    fontFamily: "SF_Pro_Medium",
    color: "#1D1D1D",
  },
  docMeta: {
    marginTop: 3,
    fontSize: rf(11),
    fontFamily: "SF_Pro_Regular",
    color: "#6B7280",
  },
  bottomBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#000",
  },
  captionInput: {
    flex: 1,
    minHeight: 42,
    maxHeight: 110,
    borderRadius: 21,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#1F2937",
    color: "#fff",
    fontSize: rf(14),
    fontFamily: "SF_Pro_Regular",
  },
  sendBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#00DEAB",
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: { opacity: 0.6 },
});
