import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { SelectedFile } from "../types/attachment.types";
import { formatFileSize, getFileExtension } from "../utils/fileValidation";

type Props = {
  file: SelectedFile;
  onRemove: () => void;
  onDownload?: () => void;
};

const FILE_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  pdf: "document-text",
  doc: "document-text",
  docx: "document-text",
  png: "image",
  jpg: "image",
  jpeg: "image",
  svg: "image",
  webp: "image",
  avif: "image",
  csv: "grid",
  xls: "grid",
  xlsx: "grid",
  ppt: "easel",
  zip: "archive",
  rar: "archive",
  txt: "document",
  sql: "code-slash",
};

const getIconName = (extension: string): keyof typeof Ionicons.glyphMap => {
  return FILE_ICONS[extension.toLowerCase()] ?? "document";
};

export default function FilePreviewCard({ file, onRemove, onDownload }: Props) {
  const extension = getFileExtension(file.name);
  const iconName = getIconName(extension);

  return (
    <View style={styles.card}>
      <View style={styles.iconWrap}>
        <Ionicons name={iconName} size={20} color="#0DDFAB" />
      </View>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {file.name}
        </Text>
        <Text style={styles.size}>{formatFileSize(file.size)}</Text>
      </View>
      {!!onDownload && (
        <TouchableOpacity style={styles.actionBtn} onPress={onDownload} hitSlop={8}>
          <Ionicons name="download-outline" size={18} color="#1D1D1D" />
        </TouchableOpacity>
      )}
      <TouchableOpacity style={styles.actionBtn} onPress={onRemove} hitSlop={8}>
        <Ionicons name="close" size={18} color="#FF0000" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1D1D1D",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "rgba(13, 223, 171, 0.15)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  info: {
    flex: 1,
    marginRight: 8,
  },
  name: {
    fontSize: 13,
    color: "#0DDFAB",
    fontFamily: "SF_Pro_Semibold",
  },
  size: {
    fontSize: 11,
    color: "#AAAAAA",
    fontFamily: "SF_Pro_Regular",
    marginTop: 2,
  },
  actionBtn: {
    padding: 4,
    marginLeft: 4,
  },
});
