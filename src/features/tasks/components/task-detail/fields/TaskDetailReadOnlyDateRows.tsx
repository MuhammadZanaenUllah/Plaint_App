// Read-only creator/date rows for the task-detail sheet (AUD-081 phase 3).

import Avatar from "@/components/Avatar";
import { TaskDetailInfoRow } from "../TaskDetailInfoRow";
import { taskDetailFieldStyles as styles } from "../taskDetailFieldStyles";
import { Text, View } from "react-native";

type Props = {
  createdByName: string;
  createdByImage?: string;
  createdAtDisplay: string;
  startDateDisplay: string;
};

export function TaskDetailReadOnlyDateRows({
  createdByName,
  createdByImage,
  createdAtDisplay,
  startDateDisplay,
}: Props) {
  return (
    <>
      <TaskDetailInfoRow icon="person-outline" label="Created By:">
        <View style={styles.assignedRow}>
          <Avatar
            name={createdByName}
            imagePath={createdByImage}
            size={20}
            borderRadius={4}
          />
          <Text style={styles.infoValue}>{createdByName}</Text>
        </View>
      </TaskDetailInfoRow>

      <TaskDetailInfoRow icon="calendar-outline" label="Created At:">
        <Text style={styles.infoValue}>{createdAtDisplay}</Text>
      </TaskDetailInfoRow>

      <TaskDetailInfoRow icon="calendar-outline" label="Start Date:">
        <Text style={styles.infoValue}>{startDateDisplay}</Text>
      </TaskDetailInfoRow>
    </>
  );
}
