// react-native-pell-rich-editor@1.10.0 implements RichEditor.showAndroidKeyboard()
// (see src/RichEditor.js) but its shipped index.d.ts omits it from the class.
import "react-native-pell-rich-editor";

declare module "react-native-pell-rich-editor" {
  interface RichEditor {
    showAndroidKeyboard(): void;
  }
}
