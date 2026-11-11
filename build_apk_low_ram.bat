@echo off
setlocal enabledelayedexpansion

echo ======================================================================
echo UGC NET Education (Code 09) - Low RAM APK Builder
echo ======================================================================

cd /d "%~dp0"

echo [1/5] Freeing RAM: Stopping all idle Gradle daemons...
cd android
call gradlew.bat --stop >nul 2>&1
cd ..

echo [2/5] Building web assets...
call node scripts/build-web.js
if %ERRORLEVEL% neq 0 (
    echo Error during web build.
    exit /b %ERRORLEVEL%
)

echo [3/5] Syncing Capacitor Android assets...
call npx cap sync android
if %ERRORLEVEL% neq 0 (
    echo Error during Capacitor sync.
    exit /b %ERRORLEVEL%
)

echo [4/5] Building Android APK with low-memory JVM profile (768MB heap, single worker)...
cd android
set _JAVA_OPTIONS=-Xmx1024m -XX:+UseParallelGC
set GRADLE_OPTS=-Dorg.gradle.jvmargs="-Xmx1024m -XX:+UseParallelGC" -Dorg.gradle.parallel=false -Dorg.gradle.workers.max=2
call gradlew.bat assembleDebug --no-daemon --max-workers=2
if %ERRORLEVEL% neq 0 (
    echo Error during Gradle assembleDebug.
    cd ..
    exit /b %ERRORLEVEL%
)
cd ..

echo [5/5] Copying fresh APK to workspace root...
copy /y "android\app\build\outputs\apk\debug\app-debug.apk" "StudySynth.apk" >nul
copy /y "android\app\build\outputs\apk\debug\app-debug.apk" "UGC_NET_Education_Code09.apk" >nul

echo ======================================================================
echo SUCCESS! APK is ready:
echo File: %~dp0UGC_NET_Education_Code09.apk
echo ======================================================================

