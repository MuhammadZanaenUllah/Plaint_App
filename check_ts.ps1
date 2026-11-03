$tscOutput = npx tsc --noEmit 2>&1
$tasksErrors = $tscOutput -split "`n" | Where-Object { $_ -match "tasks.tsx" -and $_ -match "error TS7006" }
Write-Output "TS7006 errors in tasks.tsx: $($tasksErrors.Count)"
if ($tasksErrors.Count -gt 0) {
    $tasksErrors | ForEach-Object { Write-Output "  $_" }
} else {
    Write-Output "No TS7006 errors in tasks.tsx"
}