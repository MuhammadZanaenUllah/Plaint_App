import CreateProjectModal from "@/features/projects/components/CreateProjectModal";
import ProjectPicker from "@/features/projects/components/shared/ProjectPicker";
import SprintPicker from "@/features/projects/components/shared/SprintPicker";
import type { useTaskProjectAssignment } from "@/features/tasks/hooks/useTaskProjectAssignment";

type Props = {
  controller: ReturnType<typeof useTaskProjectAssignment>;
  companyId: number;
  companyIdentifier: string;
};

export default function TaskProjectAssignmentHost({
  controller,
  companyId,
  companyIdentifier,
}: Props) {
  return (
    <>
      <ProjectPicker
        visible={controller.projectPicker.visible}
        projects={controller.projectPicker.projects}
        loading={controller.projectPicker.loading}
        error={controller.projectPicker.error}
        canCreateProject={controller.projectPicker.canCreateProject}
        onClose={controller.projectPicker.onClose}
        onSelect={controller.projectPicker.onSelect}
        onCreateProject={controller.projectPicker.onCreateProject}
      />
      <SprintPicker
        visible={controller.sprintPicker.visible}
        projectName={controller.sprintPicker.projectName}
        sprints={controller.sprintPicker.sprints}
        loading={controller.sprintPicker.loading}
        error={controller.sprintPicker.error}
        saving={controller.sprintPicker.saving}
        onClose={controller.sprintPicker.onClose}
        onSelect={controller.sprintPicker.onSelect}
      />
      <CreateProjectModal
        visible={controller.createProject.visible}
        onClose={controller.createProject.onClose}
        companyId={companyId}
        companyIdentifier={companyIdentifier}
        onCreated={controller.createProject.onCreated}
      />
    </>
  );
}
