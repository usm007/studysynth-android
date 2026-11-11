# UGC NET Education (Code 09) - Low RAM APK Builder (PowerShell)
$ErrorActionPreference = "Stop"

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host "UGC NET Education (Code 09) - Low RAM APK Builder" -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan

$root = $PSScriptRoot
Set-Location $root

Write-Host "[1/5] Freeing RAM: Stopping all idle Gradle daemons..." -ForegroundColor Yellow
Set-Location "$root\android"
try { & .\gradlew.bat --stop } catch {}
Set-Location $root

Write-Host "[2/5] Building web assets..." -ForegroundColor Yellow
& node scripts/build-web.js

Write-Host "[3/5] Syncing Capacitor Android assets..." -ForegroundColor Yellow
& npx cap sync android

Write-Host "[4/5] Building Android APK with low-memory JVM profile..." -ForegroundColor Yellow
Set-Location "$root\android"
$env:_JAVA_OPTIONS = "-Xmx768m -XX:+UseParallelGC"
$env:GRADLE_OPTS = '-Dorg.gradle.jvmargs="-Xmx768m -XX:+UseParallelGC" -Dorg.gradle.parallel=false -Dorg.gradle.workers.max=2'

& .\gradlew.bat assembleDebug --no-daemon --max-workers=2
Set-Location $root

Write-Host "[5/5] Copying fresh APK to workspace root..." -ForegroundColor Yellow
Copy-Item "$root\android\app\build\outputs\apk\debug\app-debug.apk" "$root\UGC_NET_Education_Code09.apk" -Force

$item = Get-Item "$root\UGC_NET_Education_Code09.apk"
$sizeMB = [math]::Round($item.Length / 1MB, 2)

Write-Host "======================================================================" -ForegroundColor Green
Write-Host "SUCCESS! APK is ready: $root\UGC_NET_Education_Code09.apk ($sizeMB MB)" -ForegroundColor Green
Write-Host "======================================================================" -ForegroundColor Green

