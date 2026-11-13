// Due-date / effort chip + expanded panels for the create-task sheet
// (AUD-081 phase 1).

import CalendarPicker from "@/components/CalendarPicker";
import FloatingInput from "@/components/FloatingInput";
import { pktTodayStart } from "@/features/tasks/utils/taskDate";
import { Ionicons } from "@expo/vector-icons";
import type { RefObject } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import type { EffortUnit } from "../createTaskOptions";
import { EFFORT_UNITS } from "../createTaskOptions";
import { createTaskFieldStyles as styles } from "../createTaskFieldStyles";

export function CreateDueDateEffortChip({
  isAdvanced,
  active,
  effortHours,
  effortUnitAbbrev,
  effectiveDueDate,
  onPress,
}: {
  isAdvanced: boolean;
  active: boolean;
  effortHours: string;
  effortUnitAbbrev: string;
  effectiveDueDate: Date | null;
  onPress: () => void;
}) {
  if (isAdvanced) {
    return (
      <TouchableOpacity
        style={[styles.designChip, (active || !!effortHours) && styles.designChipDark]}
        onPress={onPress}
      >
        <Ionicons
          name="time"
          size={14}
          color={active || !!effortHours ? "#FFF" : "#6B7280"}
        />
        <Text
          allowFontScaling={false}
          style={[
            styles.designChipText,
            (active || !!effortHours) && styles.designChipTextWhite,
          ]}
        >
          {effortHours ? `${effortHours} ${effortUnitAbbrev}` : effortUnitAbbrev}
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[
        styles.designChip,
        (active || !!effectiveDueDate) && styles.designChipDark,
      ]}
      onPress={onPress}
    >
      <Ionicons
        name="calendar"
        size={14}
        color={active || !!effectiveDueDate ? "#FFF" : "#6B7280"}
      />
      <Text
        allowFontScaling={false}
        style={[
          styles.designChipText,
          (active || !!effectiveDueDate) && styles.designChipTextWhite,
        ]}
      >
        {effectiveDueDate
          ? effectiveDueDate.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })
          : "Due Date"}
      </Text>
    </TouchableOpacity>
  );
}

export function CreateDueDateEffortPanel({
  isAdvanced,
  effortHours,
  effortUnit,
  effortUnitAbbrev,
  effortUnitOpen,
  onToggleEffortUnit,
  onEffortChange,
  onEffortBlur,
  onEffortUnitChange,
  effectiveDueDate,
  onSelectDueDate,
  effortRowRef,
}: {
  isAdvanced: boolean;
  effortHours: string;
  effortUnit: EffortUnit;
  effortUnitAbbrev: string;
  effortUnitOpen: boolean;
  onToggleEffortUnit: () => void;
  onEffortChange: (text: string) => void;
  onEffortBlur: () => void;
  onEffortUnitChange: (unit: EffortUnit) => void;
  effectiveDueDate: Date | null;
  onSelectDueDate: (date: Date) => void;
  effortRowRef?: RefObject<View | null>;
}) {
  if (isAdvanced) {
    return (
      <View style={styles.inlinePanelBox} ref={effortRowRef}>
        <View style={styles.effortRow}>
          <FloatingInput
            label={
              EFFORT_UNITS.find((u) => u.value === effortUnit)?.label ?? "Hours"
            }
            value={effortHours}
            onChangeText={onEffortChange}
            onBlur={onEffortBlur}
            keyboardType="numeric"
            autoFocus
            containerStyle={styles.effortInputWrap}
          />
          <View>
            <TouchableOpacity
              style={styles.effortUnitBtn}
              onPress={onToggleEffortUnit}
            >
              <Text
                allowFontScaling={false}
                style={styles.effortUnitBtnText}
              >
                {effortUnitAbbrev}
              </Text>
              <Ionicons name="chevron-down" size={12} color="#1D1D1D" />
            </TouchableOpacity>

            {effortUnitOpen && (
              <View style={styles.effortUnitDropdown}>
                {EFFORT_UNITS.map((u) => (
                  <TouchableOpacity
                    key={u.value}
                    style={styles.effortUnitDropdownItem}
                    onPress={() => onEffortUnitChange(u.value)}
                  >
                    <Text
                      allowFontScaling={false}
                      style={[
                        styles.effortUnitDropdownText,
                        u.value === effortUnit &&
                          styles.effortUnitDropdownTextActive,
                      ]}
                    >
                      {u.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.inlinePanelBox}>
      <CalendarPicker
        compact
        startDate={effectiveDueDate}
        endDate={effectiveDueDate}
        minDate={pktTodayStart()}
        disablePast
        onSelectStart={onSelectDueDate}
        onSelectEnd={onSelectDueDate}
      />
    </View>
  );
}
