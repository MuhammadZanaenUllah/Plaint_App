// Compatibility shim.
// Canonical Project/Sprint types now live in `src/features/projects/types/`.
// project.types.ts already exports the Sprint types; exporting sprint.types.ts
// again would create duplicate export errors.
export * from "@/features/projects/types/project.types";
export * from "@/features/projects/types/legacy-project.types";
