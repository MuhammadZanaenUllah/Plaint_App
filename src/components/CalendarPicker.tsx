import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

type Props = {
  startDate: Date | null;
  endDate: Date | null;
  onSelectStart: (d: Date) => void;
  onSelectEnd: (d: Date) => void;
  onDone?: () => void;
  /** When true, renders a smaller calendar suitable for inline panels */
  compact?: boolean;
};

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}
function getFirstDayMon(year: number, month: number) {
  return (new Date(year, month, 1).getDay() + 6) % 7;
}
function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function isBetween(date: Date, start: Date, end: Date) {
  return date > start && date < end;
}

export default function CalendarPicker({ startDate, endDate, onSelectStart, onSelectEnd, onDone, compact = false }: Props) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [picking, setPicking] = useState<"start" | "end">("start");
  const [showMonthDropdown, setShowMonthDropdown] = useState(false);
  const [showYearDropdown, setShowYearDropdown] = useState(false);

  // const YEARS = Array.from({ length: 20 }, (_, i) => 2000 + i); // 2016 - 2036
  const YEARS = Array.from(
    { length: 201 },
    (_, i) => viewYear - 100 + i
  );
  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayMon(viewYear, viewMonth);
  const prevMonthDays = getDaysInMonth(viewYear, viewMonth === 0 ? 11 : viewMonth - 1);
  const trailingDays = 42 - (firstDay + daysInMonth);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const handleDayPress = (day: number) => {
    const selected = new Date(viewYear, viewMonth, day);
    if (picking === "start") {
      onSelectStart(selected);
      setPicking("end");
    } else {
      if (startDate && selected < startDate) {
        onSelectStart(selected);
        setPicking("end");
      } else {
        onSelectEnd(selected);
        setPicking("start");
        onDone?.();
      }
    }
  };

  type Cell = { day: number; type: "prev" | "curr" | "next" };
  const cells: Cell[] = [
    ...Array.from({ length: firstDay }, (_, i) => ({ day: prevMonthDays - firstDay + i + 1, type: "prev" as const })),
    ...Array.from({ length: daysInMonth }, (_, i) => ({ day: i + 1, type: "curr" as const })),
    ...Array.from({ length: trailingDays }, (_, i) => ({ day: i + 1, type: "next" as const })),
  ];

  return (
    <View style={styles.container}>
      {/* Nav row */}
      <View style={styles.navRow}>
        <TouchableOpacity onPress={prevMonth} style={[styles.navBtn, compact && styles.navBtnCompact]}>
          <Ionicons name="chevron-back" size={compact ? 12 : 18} color="#1D1D1D" />
        </TouchableOpacity>

        {/* <View style={styles.navCenter}>
          <View style={styles.navLabelBtn}>
            <Text style={styles.monthLabel}>{MONTHS[viewMonth].slice(0, 3)}</Text>
            <View style={styles.triangle} />
          </View>
          <View style={styles.navLabelBtn}>
            <Text style={styles.monthLabel}>{viewYear}</Text>
            <View style={styles.triangle} />
          </View>
        </View> */}

        <View style={styles.navCenter}>
          {/* Wrapping each trigger + its own dropdown together makes the
              dropdown's absolute position relative to just that button, so
              the Year dropdown can no longer render at the Month button's
              location (previously both shared one hardcoded offset). */}
          <View style={styles.navLabelWrap}>
            <TouchableOpacity
              style={styles.navLabelBtn}
              onPress={() => {
                setShowMonthDropdown(!showMonthDropdown);
                setShowYearDropdown(false);
              }}
            >
              <Text style={[styles.monthLabel, compact && styles.monthLabelCompact]}>
                {MONTHS[viewMonth].slice(0, 3)}
              </Text>

              <Ionicons
                name={showMonthDropdown ? "chevron-up" : "chevron-down"}
                size={compact ? 10 : 14}
                color="#00DEAB"
              />
            </TouchableOpacity>

            {showMonthDropdown && (
              <View style={[styles.dropdown, compact && styles.dropdownCompact]}>
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  nestedScrollEnabled
                >
                  {MONTHS.map((month, index) => (
                    <TouchableOpacity
                      key={month}
                      style={[
                        styles.dropdownItem,
                        compact && styles.dropdownItemCompact,
                        index === viewMonth && styles.selectedItem,
                      ]}
                      onPress={() => {
                        setViewMonth(index);
                        setShowMonthDropdown(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.dropdownText,
                          compact && styles.dropdownTextCompact,
                          index === viewMonth && styles.selectedText,
                        ]}
                      >
                        {month}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>

          <View style={styles.navLabelWrap}>
            <TouchableOpacity
              style={styles.navLabelBtn}
              onPress={() => {
                setShowYearDropdown(!showYearDropdown);
                setShowMonthDropdown(false);
              }}
            >
              <Text style={[styles.monthLabel, compact && styles.monthLabelCompact]}>{viewYear}</Text>

              <Ionicons
                name={showYearDropdown ? "chevron-up" : "chevron-down"}
                size={compact ? 10 : 14}
                color="#00DEAB"
              />
            </TouchableOpacity>

            {showYearDropdown && (
              <View style={[styles.dropdown, compact && styles.dropdownCompact]}>
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  nestedScrollEnabled
                >
                  {YEARS.map((year) => (
                    <TouchableOpacity
                      key={year}
                      style={[
                        styles.dropdownItem,
                        compact && styles.dropdownItemCompact,
                        year === viewYear && styles.selectedItem,
                      ]}
                      onPress={() => {
                        setViewYear(year);
                        setShowYearDropdown(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.dropdownText,
                          compact && styles.dropdownTextCompact,
                          year === viewYear && styles.selectedText,
                        ]}
                      >
                        {year}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>
        </View>
        <TouchableOpacity onPress={nextMonth} style={[styles.navBtn, compact && styles.navBtnCompact]}>
          <Ionicons name="chevron-forward" size={compact ? 12 : 18} color="#1D1D1D" />
        </TouchableOpacity>
      </View>

      {/* Day headers */}
      <View style={styles.weekRow}>
        {DAYS.map(d => <Text key={d} style={[styles.dayHeader, compact && styles.dayHeaderCompact]}>{d}</Text>)}
      </View>

      {/* Grid */}
      <View style={styles.grid}>
        {cells.map((cell, i) => {
          const isCurr = cell.type === "curr";
          const date = isCurr ? new Date(viewYear, viewMonth, cell.day) : null;
          const isToday = date ? isSameDay(date, today) : false;
          const isStart = date && startDate ? isSameDay(date, startDate) : false;
          const isEnd = date && endDate ? isSameDay(date, endDate) : false;
          const inRange = date && startDate && endDate ? isBetween(date, startDate, endDate) : false;
          const isSelected = isStart || isEnd;

          return (
            <View key={i} style={styles.cellWrap}>
              <TouchableOpacity
               style={[
  styles.cell,
  isToday && !isSelected && styles.cellToday,
  inRange && styles.cellInRange,
  isSelected && styles.cellSelected,
]}
                onPress={() => isCurr && handleDayPress(cell.day)}
                activeOpacity={isCurr ? 0.7 : 1}
              >
                <Text style={[
                  styles.dayText,
                  compact && styles.dayTextCompact,
                  !isCurr && styles.dayTextGrey,
                  isToday && !isSelected && styles.dayTextToday,
                  isSelected && styles.dayTextSelected,
                  inRange && styles.dayTextInRange,
                ]}>
                  {cell.day}
                </Text>
                {isToday && !isSelected && <View style={styles.todayUnderline} />}
              </TouchableOpacity>
            </View>
          );
        })}
      </View>

      {/* No Apply button — popup closes automatically after end date is picked */}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 10,
    paddingVertical: 15,
    paddingHorizontal: 15,
    marginTop: 8,
    backgroundColor: "#F4F4F4",
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  navBtn: {
    width: 34, height: 34, borderRadius: 20,
    borderWidth: 1, borderColor: "#E6E6E6",
    backgroundColor: "#fff",
    alignItems: "center", justifyContent: "center",
  },
  navBtnCompact: {
    width: 26, height: 26, borderRadius: 13,
  },
  navCenter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  navLabelWrap: {
    position: "relative",
  },
  navLabelBtn: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: "center",
    gap: 4,
  },
  monthLabel: {
    fontSize: 15,
    fontFamily: "SF_Pro_Semibold",
    color: "#1D1D1D",
  },
  monthLabelCompact: {
    fontSize: 12,
  },
  triangle: {
    width: 0, height: 0,
    borderLeftWidth: 4, borderRightWidth: 4, borderTopWidth: 50,
    borderLeftColor: "transparent", borderRightColor: "transparent",
    borderTopColor: "#00DEAB",
    marginTop: 2,
  },
  weekRow: {
    flexDirection: "row",
    marginBottom: 4,
    paddingHorizontal: 2,
  },
  dayHeader: {
    width: "14.2%",
    textAlign: "center",
    fontSize: 12,
    color: "#9CA3AF",
    fontFamily: "SF_Pro_Medium",
    paddingVertical: 4,
  },
  dayHeaderCompact: {
    fontSize: 11,
    paddingVertical: 2,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 2,
  },
  cellWrap: {
    width: "14.2%",
    aspectRatio: 1,
    padding: 2,
  },
  cell: {
    flex: 1, borderRadius: 8,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.05, shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  cellInRange: {
    backgroundColor: "#E0FFF8",
  },
  cellSelected: {
    backgroundColor: "#00DEAB",
  },
  dayText: {
    fontSize: 13,
    color: "#1D1D1D",
    fontFamily: "SF_Pro_Medium",
  },
  dayTextCompact: {
    fontSize: 11,
  },
  cellToday: {
  borderWidth: 1.5,
  borderColor: "#00DEAB",
},
  dayTextGrey: { color: "#C0C0C0" },
  dayTextToday: { color: "#00DEAB", fontFamily: "SF_Pro_Semibold" },
  dayTextSelected: { color: "#fff", fontFamily: "SF_Pro_Semibold" },
  dayTextInRange: { color: "#00DEAB" },
  todayUnderline: {
    position: "absolute", bottom: 3,
    width: 16, height: 2, borderRadius: 1,
    backgroundColor: "#00DEAB",
    // borderWidth: 1,
    // borderColor: "#00DEAB",
    // borderRadius: 5,
  },
  doneBtn: {
    marginTop: 10, marginHorizontal: 4,
    backgroundColor: "#00DEAB",
    borderRadius: 10, paddingVertical: 12,
    alignItems: "center",
  },
  doneBtnText: {
    color: "#fff", fontSize: 15,
    fontFamily: "SF_Pro_Semibold",
  },
  dropdown: {
    position: "absolute",
    top: 44,
    left: 0,

    width: 150,
    maxHeight: 220,

    backgroundColor: "#FFF",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#EAEAEA",

    zIndex: 999,
    elevation: 10,
  },
  dropdownCompact: {
    width: 110,
    maxHeight: 160,
  },

  dropdownItem: {
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  dropdownItemCompact: {
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  dropdownText: {
    fontSize: 15,
    textAlign: "center",
    color: "#1D1D1D",
    fontFamily: "SF_Pro_Medium",
  },
  dropdownTextCompact: {
    fontSize: 12,
  },
  selectedItem: {},
  selectedText: {},
});
