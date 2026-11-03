// Compatibility re-exports. Canonical validation lives in ../taskValidation.ts.
export {
  validateCreateTask,
  validateUpdateTask,
  validateRecurrence,
  validateDueDate,
  validateReject,
  validateReopen,
  validateAttachment,
  type CreateTaskForm,
  type UpdateTaskForm,
  type RecurrenceForm,
  type ValidationResult,
  type ValidationErrors,
} from "../taskValidation";
