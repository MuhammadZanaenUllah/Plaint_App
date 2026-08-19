// components/ui/RichTextEditor.tsx
//
// Reusable rich text editor styled after the "Description" field in the
// reference design: a bordered box with a floating label cut into the top
// border, a WYSIWYG content area, and a pill-shaped toolbar (Bold, Italic,
// Underline, Emoji, Link, Bulleted list).
//
// All colors/spacing are defined directly in this file's StyleSheet —
// no external theme file needed. Just copy this one file into your project.
//
// Usage:
//   const editorRef = useRef<RichTextEditorRef>(null);
//   <RichTextEditor
//     label="Description"
//     placeholder="Write a description..."
//     initialHTML={description}
//     onChangeHTML={(html) => setDescription(html)}
//   />
//
// Install dependencies once per project:
//   npx expo install react-native-webview
//   npm install react-native-pell-rich-editor
//   (@expo/vector-icons ships with Expo already)

import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import { RichEditor, actions } from 'react-native-pell-rich-editor';
import { useSwipeToDismiss } from '@/hooks/useSwipeToDismiss';
import SheetDragHandle from './SheetDragHandle';

const EMOJIS = [
  '😀', '😁', '😂', '🙂', '😉', '😍',
  '👍', '👏', '🙏', '🔥', '🎉', '❤️',
  '✅', '⭐', '🚀', '💡', '📌', '👀',
];

export interface RichTextEditorRef {
  focus: () => void;
  blur: () => void;
  clear: () => void;
  getContentHtml: () => Promise<string> | undefined;
  setContentHtml: (html: string) => void;
}

export interface RichTextEditorProps {
  /** Floating label rendered on the top border, e.g. "Description" */
  label?: string;
  placeholder?: string;
  /** Initial HTML content (uncontrolled) */
  initialHTML?: string;
  /** Fired on every content change with the current HTML */
  onChangeHTML?: (html: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  /** Height of the editable content area, excludes toolbar */
  editorHeight?: number;
  /** Disable editing and dim the toolbar */
  disabled?: boolean;
  /** Hide the bottom toolbar entirely */
  showToolbar?: boolean;
  containerStyle?: ViewStyle | (ViewStyle | undefined | false)[];
  autoFocus?: boolean;
}

const RichTextEditor = forwardRef<RichTextEditorRef, RichTextEditorProps>(
  (
    {
      label,
      placeholder = '',
      initialHTML = '',
      onChangeHTML,
      editorHeight = 220,
      disabled = false,
      showToolbar = true,
      containerStyle,
      onFocus: onFocusProp,
      onBlur: onBlurProp,
      autoFocus = false,
    },
    ref
  ) => {
    const richText = useRef<RichEditor>(null);
    const [emojiVisible, setEmojiVisible] = useState(false);
    const [linkVisible, setLinkVisible] = useState(false);
    const emojiSwipe = useSwipeToDismiss(emojiVisible, () => setEmojiVisible(false));
    const linkSwipe = useSwipeToDismiss(linkVisible, () => setLinkVisible(false));
    const [linkUrl, setLinkUrl] = useState('');
    const [linkText, setLinkText] = useState('');
    const [focused, setFocused] = useState(false);
    const [activeStyles, setActiveStyles] = useState<string[]>([]);
    const [hasContent, setHasContent] = useState(initialHTML.replace(/<[^>]*>/g, '').trim().length > 0);

    useImperativeHandle(ref, () => ({
      focus: () => richText.current?.focusContentEditor(),
      blur: () => richText.current?.blurContentEditor(),
      clear: () => richText.current?.setContentHTML(''),
      getContentHtml: () => richText.current?.getContentHtml(),
      setContentHtml: (html: string) => richText.current?.setContentHTML(html),
    }));

    const handleChange = useCallback(
      (html: string) => {
        // Strip HTML tags to detect real content
        const plain = html.replace(/<[^>]*>/g, '').trim();
        setHasContent(plain.length > 0);
        onChangeHTML?.(html);
      },
      [onChangeHTML]
    );

    const openEmojiPicker = () => setEmojiVisible(true);

    const insertEmoji = (emoji: string) => {
      richText.current?.insertText(emoji);
      setEmojiVisible(false);
      setTimeout(() => {
        if (Platform.OS === 'android') {
          richText.current?.showAndroidKeyboard();
        }
        richText.current?.focusContentEditor();
      }, 100);
    };

    const openLinkModal = () => {
      setLinkUrl('');
      setLinkText('');
      setLinkVisible(true);
    };

    const confirmLink = () => {
      const url = linkUrl.trim();
      if (!url) {
        setLinkVisible(false);
        return;
      }
      const display = linkText.trim() || url;
      richText.current?.insertLink(display, url);
      setLinkVisible(false);
      setTimeout(() => {
        if (Platform.OS === 'android') {
          richText.current?.showAndroidKeyboard();
        }
        richText.current?.focusContentEditor();
      }, 100);
    };

    // Custom action identifiers not covered by the library's built-in list.
    const EMOJI_ACTION = 'insertEmoji';
    const LINK_ACTION = 'insertCustomLink';

    const toolbarActions = [
      actions.setBold,
      actions.setItalic,
      actions.setUnderline,
      EMOJI_ACTION,
      LINK_ACTION,
      actions.insertBulletsList,
    ];

    const renderToolbarAction = (action: string, index: number) => {
      const isSelected = activeStyles.includes(action);
      const activeColor = '#00C896';
      const defaultColor = disabled ? '#C9C9C9' : '#2B2B2B';
      const color = isSelected ? activeColor : defaultColor;

      if (action === EMOJI_ACTION) {
        return (
          <TouchableOpacity key={action} style={styles.toolbarButton} onPress={openEmojiPicker} disabled={disabled}>
            <MaterialCommunityIcons name="emoticon-outline" size={22} color={defaultColor} />
          </TouchableOpacity>
        );
      }
      if (action === LINK_ACTION) {
        return (
          <TouchableOpacity key={action} style={styles.toolbarButton} onPress={openLinkModal} disabled={disabled}>
            <MaterialCommunityIcons name="link-variant" size={22} color={defaultColor} />
          </TouchableOpacity>
        );
      }
      if (action === actions.insertBulletsList) {
        return (
          <TouchableOpacity key={action} style={styles.toolbarButton} onPress={() => {
            if (Platform.OS === 'android') richText.current?.showAndroidKeyboard();
            richText.current?.sendAction(action, 'result', true);
            richText.current?.focusContentEditor();
          }} disabled={disabled}>
            <MaterialCommunityIcons name="format-list-bulleted" size={22} color={color} />
          </TouchableOpacity>
        );
      }

      const iconMap: Record<string, string> = {
        [actions.setBold]: 'format-bold',
        [actions.setItalic]: 'format-italic',
        [actions.setUnderline]: 'format-underline',
      };
      return (
        <TouchableOpacity key={action} style={styles.toolbarButton} onPress={() => {
          if (Platform.OS === 'android') richText.current?.showAndroidKeyboard();
          richText.current?.sendAction(action, 'result', true);
          richText.current?.focusContentEditor();
        }} disabled={disabled}>
          <MaterialCommunityIcons name={iconMap[action] as any} size={22} color={color} />
        </TouchableOpacity>
      );
    };

    // ── Always render bordered box with floating label ─────────
    return (
      <View
        style={[
          styles.container,
          focused && styles.containerFocused,
          containerStyle,
        ]}
      >
        {/* Floating label cut into the top border */}
        {!!label && (
          <View style={styles.labelWrapper}>
            <Text style={styles.labelText}>{label}</Text>
          </View>
        )}

        <RichEditor
          ref={richText}
          initialContentHTML={initialHTML}
          placeholder={placeholder}
          disabled={disabled}
          onChange={handleChange}
          onFocus={() => { setFocused(true); onFocusProp?.(); }}
          onBlur={() => { setFocused(false); onBlurProp?.(); }}
          editorStyle={{
            contentCSSText: `
              font-size: 15px;
              color: #1A1A1A;
              padding: 0;
            `,
            placeholderColor: '#B3B3B3',
          }}
          style={styles.editor}
          initialHeight={editorHeight}
          androidLayerType="software"
          focusable
          onLoadEnd={() => {
            richText.current?.registerToolbar((items) =>
              setActiveStyles(items.map(String))
            );
            if (autoFocus) {
              setTimeout(() => {
                if (Platform.OS === 'android') richText.current?.showAndroidKeyboard();
                richText.current?.focusContentEditor();
              }, 300);
            }
          }}
        />

        {showToolbar && (
          // Custom toolbar — avoids RichToolbar's internal ScrollView
          // passing justifyContent to style (Invariant Violation).
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.toolbar}
            contentContainerStyle={styles.toolbarContent}
            keyboardShouldPersistTaps="always"
          >
            {toolbarActions.map((action, index) =>
              renderToolbarAction(action, index)
            )}
          </ScrollView>
        )}

        {/* Emoji picker */}
        <Modal
          visible={emojiVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setEmojiVisible(false)}
        >
          <Pressable
            style={styles.modalOverlay}
            onPress={() => setEmojiVisible(false)}
          >
            <Animated.View style={[styles.emojiSheet, emojiSwipe.animatedStyle]}>
              <GestureDetector gesture={emojiSwipe.panGesture}>
                <View>
                  <SheetDragHandle />
                  <Text style={styles.sheetTitle}>Insert emoji</Text>
                </View>
              </GestureDetector>
              <View style={styles.emojiGrid}>
                {EMOJIS.map((emoji) => (
                  <TouchableOpacity
                    key={emoji}
                    style={styles.emojiCell}
                    onPress={() => insertEmoji(emoji)}
                  >
                    <Text style={styles.emojiText}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Animated.View>
          </Pressable>
        </Modal>

        {/* Link insertion modal */}
        <Modal
          visible={linkVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setLinkVisible(false)}
        >
          <Pressable
            style={styles.modalOverlay}
            onPress={() => setLinkVisible(false)}
          >
            <Animated.View style={linkSwipe.animatedStyle}>
            <Pressable style={styles.linkSheet} onPress={() => { }}>
              <GestureDetector gesture={linkSwipe.panGesture}>
                <View>
                  <SheetDragHandle />
                  <Text style={styles.sheetTitle}>Insert link</Text>
                </View>
              </GestureDetector>
              <TextInput
                style={styles.linkInput}
                placeholder="https://example.com"
                placeholderTextColor="#B3B3B3"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType={Platform.select({
                  ios: 'url',
                  android: 'default',
                })}
                value={linkUrl}
                onChangeText={setLinkUrl}
              />
              <TextInput
                style={styles.linkInput}
                placeholder="Display text (optional)"
                placeholderTextColor="#B3B3B3"
                value={linkText}
                onChangeText={setLinkText}
              />
              <View style={styles.linkActionsRow}>
                <TouchableOpacity
                  style={[styles.linkButton, styles.linkButtonGhost]}
                  onPress={() => setLinkVisible(false)}
                >
                  <Text style={styles.linkButtonGhostText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.linkButton}
                  onPress={confirmLink}
                >
                  <Text style={styles.linkButtonText}>Insert</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
            </Animated.View>
          </Pressable>
        </Modal>
      </View>
    );
  }
);

RichTextEditor.displayName = 'RichTextEditor';

export default RichTextEditor;

const styles = StyleSheet.create({
  // ── Idle state styles ────────────────────────────────────────────────────
  idleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  idleIcon: {
    marginRight: 8,
  },
  idlePlaceholder: {
    fontSize: 15,
    color: '#E6E6E6',
    fontFamily: 'SF_Pro_Regular',
  },

  // ── Active / expanded state styles ───────────────────────────────────────
  container: {
    borderWidth: 1,
    borderColor: '#1D1D1D',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
    paddingTop: 16,
    backgroundColor: '#FFFFFF',
    position: 'relative',
  },
  containerFocused: {
    borderColor: '#1D1D1D',
  },
  labelWrapper: {
    position: 'absolute',
    top: -10,
    left: 16,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 4,
  },
  labelText: {
    fontSize: 12,
    // fontWeight: '500',
    color: '#1D1D1D',
    fontFamily: 'SF_Pro_Regular',
  },
  editor: {
    minHeight: 120,
  },
  toolbar: {
    width: '80%',
    backgroundColor: '#F1F1F1',
    borderRadius: 5,
    marginTop: 12,
    borderTopWidth: 0,
    // paddingHorizontal: 12,
  },
  toolbarContent: {
    // justifyContent is safe here because it's in contentContainerStyle
    justifyContent: 'space-between',
    alignItems: 'center',
    flexGrow: 1,
    // paddingHorizontal: 4,
  },
  toolbarButton: {
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolbarLabel: {
    fontSize: 16,
    lineHeight: 22,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  emojiSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
  },
  sheetTitle: {
    fontSize: 13,
    color: '#1A1A1A',
    marginBottom: 12,
    fontWeight: '600',
  },
  emojiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  emojiCell: {
    width: '16.66%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiText: {
    fontSize: 26,
  },
  linkSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
  },
  linkInput: {
    borderWidth: 1,
    borderColor: '#E2E2E2',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    fontSize: 15,
    color: '#1A1A1A',
  },
  linkActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 4,
  },
  linkButton: {
    backgroundColor: '#00D9A6',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 20,
    marginLeft: 8,
  },
  linkButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  linkButtonGhost: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E2E2',
  },
  linkButtonGhostText: {
    color: '#1A1A1A',
    fontWeight: '600',
  },
});