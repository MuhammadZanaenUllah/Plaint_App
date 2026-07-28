import * as DocumentPicker from "expo-document-picker";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, TouchableOpacity } from "react-native";
import type { SelectedFile } from "../types/attachment.types";
import { isExtensionAllowed, getFileExtension } from "../utils/fileValidation";
import Icons from "@/constants/icons";
import { showInfo, showError } from "@/utils/toast";

type Props = {
  onPick: (files: SelectedFile[]) => void;
  multiple?: boolean;
};

const ALLOWED_LIST = ["png", "jpg", "jpeg", "pdf", "doc", "docx", "csv", "txt", "zip", "rar", "sql", "ppt", "xls", "xlsx", "svg", "webp", "avif"].join(", ");

export default function DocumentPickerButton({ onPick, multiple = false }: Props) {
  const handlePress = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        multiple,
        type: "*/*",
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const assets = result.assets ?? [];
      const validFiles: SelectedFile[] = [];

      for (const asset of assets) {
        const extension = getFileExtension(asset.name);

        if (!isExtensionAllowed(extension)) {
          showInfo(
            "Unsupported File",
            `"${asset.name}" is not supported.\n\nAllowed formats: ${ALLOWED_LIST}`
          );
          continue;
        }

        validFiles.push({
          name: asset.name,
          uri: asset.uri,
          mimeType: asset.mimeType ?? "application/octet-stream",
          size: asset.size ?? 0,
          extension,
        });
      }

      if (validFiles.length > 0) {
        onPick(validFiles);
      }
    } catch {
      showError("Error", "Failed to pick document. Please try again.");
    }
  };

  return (
    <TouchableOpacity style={styles.button} onPress={handlePress} activeOpacity={0.7}>
      {/* <Ionicons name="link-outline" size={20} color="#1D1D1D" /> */}
      <Icons.LinkIcon/>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 35,
    height: 35,
    borderWidth: 1,
    borderColor: "#E6E6E6",
    backgroundColor: "#E6E6E6",
    borderRadius: 5,
    justifyContent: "center",
    alignItems: "center",
  },
});
