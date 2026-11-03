$tscOutput = npx tsc --noEmit 2>&1
# Count errors in tasks.tsx only
$tasksErrorLines = @($tscOutput -split "`n" | Where-Object { $_ -match "tasks.tsx" -and $_ -match "error TS" })
Write-Output "=== TypeScript Error Summary ==="
Write-Output "Total errors in tsc output: $($tasksErrorLines.Count)"
if ($tasksErrorLines.Count -gt 0) {
    Write-Output "tasks.tsx errors:"
    $tasksErrorLines | ForEach-Object { Write-Output "  $_" }
} else {
    Write-Output "No errors in tasks.tsx - SUCCESS"
}

# Check Phase 1 new files
$newFilePaths = @(
  'src/features/tasks/types/task.types.ts',
  'src/features/tasks/types/project.types.ts', 
  'src/features/tasks/socket/socket.types.ts',
  'src/features/tasks/constants/taskTabs.ts',
  'src/features/tasks/constants/statuses.ts',
  'src/features/tasks/constants/priorities.ts',
  'src/features/tasks/utils/date/pkt-date-formatter.ts',
  'src/features/tasks/utils/date/due-date-calculator.ts',
  'src/features/tasks/utils/effort/minutes-converter.ts',
  'src/features/tasks/utils/effort/effort-display.ts',
  'src/features/tasks/utils/status/status-mapper.ts',
  'src/features/tasks/utils/status/effort-rules.ts',
  'src/features/tasks/utils/validation/create-task-validation.ts',
  'src/features/tasks/utils/validation/status-validation.ts',
  'src/features/tasks/permissions/taskPermissions.ts',
  'src/features/tasks/api/response-handler.ts',
  'src/features/tasks/api/error-extractor.ts',
  'src/features/tasks/api/tasks.service.ts',
  'src/features/projects/api/projects.service.ts',
  'src/features/tasks/store/tasksStore.ts',
  'src/features/tasks/store/index.ts',
  'src/features/tasks/store/filtersStore.ts',
  'src/features/tasks/store/uiStore.ts',
  'src/features/tasks/store/projectsStore.ts',
  'src/features/tasks/store/selectorsStore.ts',
  'src/features/tasks/store/lifecycleStore.ts',
  'src/features/tasks/store/detailStore.ts',
  'src/features/tasks/dev/counters.ts',
  'src/context/TaskContext.tsx'
)

Write-Output "`n=== Phase 1 New Files TypeCheck ==="
$phase1ErrorCount = 0
foreach ($path in $newFilePaths) {
    $escapedPath = [regex]::Escape($path)
    $matchingErrors = @($tscOutput -split "`n" | Where-Object { $_ -match $escapedPath -and $_ -match "error TS" })
    if ($matchingErrors.Count -gt 0) {
        Write-Output "ERROR in $path: $($matchingErrors.Count) errors"
        $phase1ErrorCount++
    } else {
        Write-Output "$path: 0 errors"
    }
}
Write-Output "`nPhase 1 files with errors: $phase1ErrorCount"