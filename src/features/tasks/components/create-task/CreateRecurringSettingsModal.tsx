// Recurring-task settings overlay for the create-task sheet (AUD-081 phase 2).
// Controlled by CreateTaskModal; all state remains in the parent.

import { RECURRING_PERIOD_OPTIONS } from "@/features/tasks/components/create-task/createTaskTypes";
import type { RecurringPeriod } from "@/features/tasks/types/task.types";
import { rf } from "@/utils/responsive";
import { Ionicons } from "@expo/vector-icons";
import ModalCloseButton from "@/components/ModalCloseButton";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { createTaskModalStyles as styles } from "./createTaskModalStyles";

const RECURRING_PERIODS = RECURRING_PERIOD_OPTIONS;
const WEEK_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type Props = {
  visible: boolean;
  onClose: () => void;
  isRecurringEnabled: boolean;
  onTurnOff: () => void;
  recurringPeriod: RecurringPeriod | null;
  periodDropdownOpen: boolean;
  onTogglePeriodDropdown: () => void;
  onSelectPeriod: (period: RecurringPeriod) => void;
  recurringExcludeDays: string[];
  onToggleExcludeDay: (day: string) => void;
  recurringWeekDay: string | null;
  onSelectWeekDay: (day: string) => void;
  recurringMonthDate: string;
  onChangeMonthDate: (value: string) => void;
  recurringAnnualMonth: string;
  onChangeAnnualMonth: (value: string) => void;
  recurringAnnualDate: string;
  onChangeAnnualDate: (value: string) => void;
  recurringTime: string;
  onChangeTime: (value: string) => void;
  recurringTotalCount: string;
  onChangeTotalCount: (value: string) => void;
  onDone: () => void;
};

export function CreateRecurringSettingsModal({
  visible,
  onClose,
  isRecurringEnabled,
  onTurnOff,
  recurringPeriod,
  periodDropdownOpen,
  onTogglePeriodDropdown,
  onSelectPeriod,
  recurringExcludeDays,
  onToggleExcludeDay,
  recurringWeekDay,
  onSelectWeekDay,
  recurringMonthDate,
  onChangeMonthDate,
  recurringAnnualMonth,
  onChangeAnnualMonth,
  recurringAnnualDate,
  onChangeAnnualDate,
  recurringTime,
  onChangeTime,
  recurringTotalCount,
  onChangeTotalCount,
  onDone,
}: Props) {
  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <Pressable style={styles.centerModalOverlay} onPress={onClose}>
          <Pressable style={styles.centerModalCard} onPress={() => {}}>
            <View style={styles.centerModalHeader}>
              <Text style={styles.centerModalTitle}>Recurring Task Settings</Text>
              {isRecurringEnabled && (
                <TouchableOpacity onPress={onTurnOff} style={{ marginRight: 12 }}>
                  <Text
                    style={{
                      fontSize: rf(12),
                      color: "#EF4444",
                      fontFamily: "SF_Pro_Medium",
                    }}
                  >
                    Turn Off
                  </Text>
                </TouchableOpacity>
              )}
              <ModalCloseButton onPress={onClose} />
            </View>

            <ScrollView
              style={{ maxHeight: 320 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.recurringCardBody}>
            <View style={styles.fieldRow}>
              <Ionicons
                name="calendar-outline"
                size={16}
                color="#1D1D1D"
                style={styles.fieldIcon}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Recurrence Period</Text>
                <TouchableOpacity
                  style={styles.fieldSelectBtn}
                  activeOpacity={0.7}
                  onPress={onTogglePeriodDropdown}
                >
                  <Text
                    style={[
                      styles.fieldSelectText,
                      !recurringPeriod && styles.fieldSelectPlaceholder,
                    ]}
                  >
                    {recurringPeriod
                      ? RECURRING_PERIODS.find(
                          (p) => p.value === recurringPeriod,
                        )?.label
                      : "+ Add Period"}
                  </Text>
                  <Ionicons name="chevron-down" size={12} color="#6B7280" />
                </TouchableOpacity>

                {periodDropdownOpen && (
                  <View style={styles.periodDropdownMenu}>
                    {RECURRING_PERIODS.map((p) => (
                      <TouchableOpacity
                        key={p.value}
                        style={styles.periodDropdownOption}
                        onPress={() => onSelectPeriod(p.value)}
                      >
                        <Text
                          style={[
                            styles.periodOptionText,
                            recurringPeriod === p.value &&
                              styles.periodOptionTextSelected,
                          ]}
                        >
                          {p.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            </View>

            {recurringPeriod === "daily" && (
              <View style={styles.fieldRow}>
                <Ionicons
                  name="ban-outline"
                  size={16}
                  color="#1D1D1D"
                  style={styles.fieldIcon}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Exclude Days</Text>
                  <View style={styles.daysPillRow}>
                    {WEEK_DAYS.map((day) => {
                      const selected = recurringExcludeDays.includes(day);
                      return (
                        <TouchableOpacity
                          key={day}
                          style={[
                            styles.dayPill,
                            selected && styles.dayPillActive,
                          ]}
                          onPress={() => onToggleExcludeDay(day)}
                        >
                          <Text
                            style={[
                              styles.dayPillText,
                              selected && styles.dayPillTextActive,
                            ]}
                          >
                            {day}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              </View>
            )}

            {recurringPeriod === "weekly" && (
              <View style={styles.fieldRow}>
                <Ionicons
                  name="calendar-outline"
                  size={16}
                  color="#1D1D1D"
                  style={styles.fieldIcon}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Week Day</Text>
                  <View style={styles.daysPillRow}>
                    {WEEK_DAYS.map((day) => {
                      const selected = recurringWeekDay === day;
                      return (
                        <TouchableOpacity
                          key={day}
                          style={[
                            styles.dayPill,
                            selected && styles.dayPillActive,
                          ]}
                          onPress={() => onSelectWeekDay(day)}
                        >
                          <Text
                            style={[
                              styles.dayPillText,
                              selected && styles.dayPillTextActive,
                            ]}
                          >
                            {day}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              </View>
            )}

            {recurringPeriod === "monthly" && (
              <View style={styles.fieldRow}>
                <Ionicons
                  name="calendar-outline"
                  size={16}
                  color="#1D1D1D"
                  style={styles.fieldIcon}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Day of Month (1-31)</Text>
                  <TextInput
                    style={styles.fieldInput}
                    placeholder="e.g. 15"
                    placeholderTextColor="#AAAAAA"
                    keyboardType="numeric"
                    value={recurringMonthDate}
                    onChangeText={onChangeMonthDate}
                  />
                </View>
              </View>
            )}

            {recurringPeriod === "annually" && (
              <>
                <View style={styles.fieldRow}>
                  <Ionicons
                    name="calendar-outline"
                    size={16}
                    color="#1D1D1D"
                    style={styles.fieldIcon}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>Month (1-12)</Text>
                    <TextInput
                      style={styles.fieldInput}
                      placeholder="e.g. 12"
                      placeholderTextColor="#AAAAAA"
                      keyboardType="numeric"
                      value={recurringAnnualMonth}
                      onChangeText={onChangeAnnualMonth}
                    />
                  </View>
                </View>
                <View style={styles.fieldRow}>
                  <Ionicons
                    name="calendar-outline"
                    size={16}
                    color="#1D1D1D"
                    style={styles.fieldIcon}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>Day of Month (1-31)</Text>
                    <TextInput
                      style={styles.fieldInput}
                      placeholder="e.g. 25"
                      placeholderTextColor="#AAAAAA"
                      keyboardType="numeric"
                      value={recurringAnnualDate}
                      onChangeText={onChangeAnnualDate}
                    />
                  </View>
                </View>
              </>
            )}

            <View style={styles.fieldRow}>
              <Ionicons
                name="time-outline"
                size={16}
                color="#1D1D1D"
                style={styles.fieldIcon}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Run Time</Text>
                <TextInput
                  style={styles.fieldInput}
                  placeholder="09:00"
                  placeholderTextColor="#AAAAAA"
                  value={recurringTime}
                  onChangeText={onChangeTime}
                />
              </View>
            </View>

            <View style={styles.fieldRow}>
              <Ionicons
                name="repeat-outline"
                size={16}
                color="#1D1D1D"
                style={styles.fieldIcon}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>No. of Recurrences</Text>
                <TextInput
                  style={styles.fieldInput}
                  placeholder="+ Add No"
                  placeholderTextColor="#AAAAAA"
                  keyboardType="numeric"
                  value={recurringTotalCount}
                  onChangeText={onChangeTotalCount}
                />
              </View>
            </View>
          </View>
        </ScrollView>

        <TouchableOpacity style={styles.doneBtn} onPress={onDone}>
          <Text style={styles.doneBtnText}>Done</Text>
        </TouchableOpacity>
      </Pressable>
    </Pressable>
  </KeyboardAvoidingView>
</Modal>
  );
}
