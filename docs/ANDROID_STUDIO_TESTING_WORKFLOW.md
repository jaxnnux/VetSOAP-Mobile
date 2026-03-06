# Android Studio + Claude Code Testing Workflow

A step-by-step guide for using Android Studio alongside Claude Code to test, profile, and assess the Captivet Mobile app on Android.

---

## Table of Contents

1. [Prerequisites & Setup](#1-prerequisites--setup)
2. [Emulator Configuration](#2-emulator-configuration)
3. [Installing Captivet on an Emulator](#3-installing-captivet-on-an-emulator)
4. [Performance Profiling](#4-performance-profiling)
5. [UI/UX Assessment](#5-uiux-assessment)
6. [Crash & Log Investigation](#6-crash--log-investigation)
7. [APK Analysis](#7-apk-analysis)
8. [Claude Code MCP Integration](#8-claude-code-mcp-integration)
9. [Combined Workflows (Step-by-Step Recipes)](#9-combined-workflows-step-by-step-recipes)
10. [Limitations & Workarounds](#10-limitations--workarounds)

---

## 1. Prerequisites & Setup

### Required software

| Component | Purpose |
|-----------|---------|
| Android Studio (2024.x+) | IDE, emulator, profiler, layout inspector |
| Android SDK Platform 34+ | Target API level for emulators |
| Android SDK Platform-Tools | ADB, included with Android Studio |
| Expo CLI (`npx expo`) | Dev server for hot reload testing |
| EAS CLI (`eas build`) | Building preview/production APKs |
| Claude Code with `android-mcp-toolkit` | Programmatic device interaction |

### Verify ADB is on your PATH

Android Studio installs ADB at `~/Android/Sdk/platform-tools/adb`. Add it to your shell:

```bash
# Add to ~/.bashrc or ~/.zshrc
export ANDROID_HOME="$HOME/Android/Sdk"
export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator"
```

Verify:

```bash
adb --version
emulator -list-avds
```

### Verify your physical device connection

Your Pixel 10 Pro XL should already be set up via ADB WiFi. Confirm:

```bash
adb devices
# Should show your device (e.g., "mustang" or its serial)
```

---

## 2. Emulator Configuration

### Why use emulators alongside your Pixel

- Test on screen sizes and API levels you don't own physically
- Simulate network conditions (slow, offline)
- Test on devices without haptic hardware (validates `.catch()` on Haptics calls)
- Reproduce bugs that only appear on specific Android versions

### Creating emulator profiles

Open Android Studio:

1. **Tools > Device Manager > Create Virtual Device**
2. Create these profiles for Captivet testing coverage:

| Profile Name | Device | API Level | Purpose |
|--------------|--------|-----------|---------|
| `Pixel_7_API_34` | Pixel 7 | 34 (Android 14) | Primary test device |
| `Pixel_Tablet_API_34` | Pixel Tablet | 34 | Tablet layout testing (vet clinic tablets) |
| `Small_Phone_API_30` | Pixel 4a | 30 (Android 11) | Small screen + older API |
| `Budget_Phone_API_28` | Nexus 5X | 28 (Android 9) | Minimum viable device, no haptics |

3. For each emulator:
   - **System Image:** Select "x86_64" images (faster than ARM on x86 hosts)
   - **RAM:** 2048 MB minimum
   - **Internal Storage:** 2048 MB (enough for APK + audio files)
   - **Enable keyboard input:** Check "Enable keyboard input" in Advanced Settings

### Starting an emulator from command line

```bash
# List available AVDs
emulator -list-avds

# Start a specific AVD
emulator -avd Pixel_7_API_34

# Start with network throttle (simulate slow connection)
emulator -avd Pixel_7_API_34 -netdelay umts -netspeed gsm
```

### Network condition simulation

In the emulator's Extended Controls (three-dot menu > More):

| Setting | Values | Test scenario |
|---------|--------|---------------|
| Network type | Full, EDGE, 3G, LTE | Upload speed for recordings |
| Signal strength | Great to None | Error handling during upload |
| Latency | None to Very High | API polling behavior |

This is critical for testing the recording upload flow — a 5-minute M4A file (~5 MB) on a throttled connection will expose timeout and retry issues.

---

## 3. Installing Captivet on an Emulator

### Option A: Development build (hot reload)

Best for iterating on UI changes. Requires the Expo dev server.

```bash
# Terminal 1: Start Expo dev server
cd /home/philgood/projects/Captivet-Mobile
npx expo start --clear

# Terminal 2: Start emulator
emulator -avd Pixel_7_API_34

# In the Expo dev server terminal, press 'a' to open on Android
# Or scan the QR code from the emulator's browser
```

The development build uses Expo Go or a dev client. Changes to JS/TS files hot-reload instantly.

**Limitation:** Expo Go may not support all native modules. If you see a native module error, you need a development build:

```bash
# Create a development build for local emulator
npx expo run:android
```

### Option B: Preview APK (production-like)

Best for testing real-world behavior, crashes, and performance. Uses the same APK you'd distribute.

```bash
# Build APK with EAS
eas build --profile preview --platform android

# Download the APK (EAS provides a URL after build completes)
# Then install on emulator:
adb install path/to/captivet-preview.apk

# Or install on your connected physical device:
adb -s <device-serial> install path/to/captivet-preview.apk
```

### Option C: Install existing APK on emulator

If you already have an APK from a previous build:

```bash
# List connected devices (emulator + physical)
adb devices

# Install on a specific emulator
adb -s emulator-5554 install captivet-preview.apk

# Force reinstall (keeps data)
adb -s emulator-5554 install -r captivet-preview.apk
```

---

## 4. Performance Profiling

### 4.1 Attaching the Android Profiler

1. **Start the app** on your device or emulator
2. In Android Studio: **View > Tool Windows > Profiler** (or click the Profiler tab at the bottom)
3. Click **"+"** (Start new profiling session)
4. Select your device/emulator from the dropdown
5. Select `com.captivet.mobile` from the process list
6. The profiler attaches — you'll see CPU, Memory, Network, and Energy timelines

**Note:** For release/preview APKs, the profiler can still attach but will show less granular data than a debuggable build. For full method tracing, use a development build.

### 4.2 CPU Profiling — Finding Slow Renders

**When to use:** App feels laggy, animations stutter, UI hangs during recording.

1. In the Profiler, click the **CPU** timeline to expand it
2. Click **Record** (choose "Sample Java/Kotlin Methods" or "Trace System Calls")
3. **Perform the action** you want to profile in the app (e.g., start a recording, navigate between tabs, scroll the recordings list)
4. Click **Stop**
5. Analyze the trace:
   - **Top Down** view: Find which methods consume the most CPU time
   - **Flame Chart** view: Visualize the call stack over time
   - **Bottom Up** view: Find the most expensive methods

**What to look for in Captivet:**

| Symptom | Where to look | Likely cause |
|---------|--------------|--------------|
| Jank during recording | Main thread blocked | Audio recording callback on main thread |
| Slow list scrolling | Excessive re-renders | Missing `React.memo` or unstable query keys |
| Login delay | Network wait on main thread | Auth flow not properly async |
| Tab switch lag | Heavy component mount | Large component trees or unoptimized queries |

**Sharing findings with Claude Code:**

```
"I profiled the recording screen for 30 seconds. The CPU trace shows
`ReactNativeFiber.commitWork` taking 45ms per frame during the recording
timer update. The flame chart shows `setDuration` triggering a full
component re-render. Can you optimize the recording timer to avoid
re-rendering the entire screen?"
```

### 4.3 Memory Profiling — Detecting Leaks

**When to use:** App slows down over time, crashes after long recording sessions, OOM errors.

1. In the Profiler, click the **Memory** timeline
2. Click **Record** (choose "Record Java/Kotlin Allocations")
3. Use the app normally for 1-2 minutes
4. Click **Stop**
5. Analyze:
   - **Heap Dump** (camera icon): Snapshot of all objects in memory
   - Look for growing allocation counts of the same class
   - Force GC (trash can icon) and compare heap sizes

**Captivet-specific memory concerns:**

| Scenario | What to watch | Threshold |
|----------|--------------|-----------|
| Long recording session | Heap growth over time | Should stay flat after initial load |
| Navigating back/forth | Activity/Fragment leaks | Old screens should be GC'd |
| Recordings list | Image/blob caching | Shouldn't cache audio blobs in memory |
| Background/foreground | Memory not released on background | Should drop significantly |

### 4.4 Network Profiling — Upload Performance

**When to use:** Uploads feel slow, timeout errors, want to verify API call patterns.

1. In the Profiler, click the **Network** timeline
2. Perform an upload flow in the app
3. The profiler shows every HTTP request with:
   - Request/response timing
   - Payload size
   - Headers
   - Response body (if debuggable build)

**What to verify for Captivet upload flow:**

```
Expected request sequence:
1. POST /api/recordings              → Small JSON (~200 bytes)
2. POST /api/recordings/:id/upload-url → Small JSON (~300 bytes)
3. PUT <R2 presigned URL>            → Large binary (1-10 MB)
4. POST /api/recordings/:id/confirm-upload → Small JSON (~100 bytes)
5. GET /api/recordings/:id           → Polling every 5s (~500 bytes each)
```

Check that:
- The audio PUT goes directly to R2, not through your API server
- Polling stops after status is `completed` or `failed`
- No duplicate requests (React Query deduplication working)
- Request payloads match expected sizes

### 4.5 Energy Profiling — Battery Impact

**When to use:** Recording sessions are long (5-30 minutes), field use on battery.

1. In the Profiler, click the **Energy** timeline
2. Start a recording session and let it run for several minutes
3. Look for:
   - **Wake locks** held during recording (expected, but should release on stop)
   - **CPU usage** during recording vs. idle
   - **Network activity** while recording (should be zero until upload)
   - **GPS/sensor** usage (should be none)

---

## 5. UI/UX Assessment

### 5.1 Layout Inspector — Native View Hierarchy

1. **Start the app** on device or emulator
2. In Android Studio: **Tools > Layout Inspector**
3. Select your device and `com.captivet.mobile`
4. The inspector shows:
   - **Component Tree** (left): Full native view hierarchy
   - **Rendered View** (center): Screenshot with selectable elements
   - **Properties** (right): All layout properties of the selected view

**What to assess:**

| Check | How | Why it matters |
|-------|-----|----------------|
| View depth | Count nesting levels in Component Tree | Deep nesting (>10 levels) causes render overhead |
| Overdraw | Enable "Show GPU Overdraw" in Developer Options | Multiple layers drawn on same pixel waste GPU |
| Touch targets | Select buttons/links, check width/height | Minimum 48dp x 48dp for accessibility |
| Text truncation | Look for clipped text in Component Tree | NativeWind styles may clip on small screens |
| Padding/margins | Select elements, check layout properties | Inconsistent spacing between screens |

### 5.2 Developer Options on Device/Emulator

Enable these Android developer options for visual debugging:

```
Settings > Developer Options > Drawing:
```

| Option | What it shows |
|--------|--------------|
| **Show layout bounds** | Outlines every view's bounds, margins, padding |
| **GPU overdraw** | Colors pixels by how many times they're drawn (blue=1x, green=2x, red=3x+) |
| **GPU rendering** | Bar chart of frame render times (green line = 16ms target) |
| **Strict mode** | Flashes screen red on disk/network I/O on main thread |

### 5.3 Accessibility Assessment

1. Enable **TalkBack** on the emulator: Settings > Accessibility > TalkBack
2. Navigate the app using TalkBack gestures:
   - Swipe right to move to next element
   - Double-tap to activate
   - Check that all interactive elements have meaningful content descriptions
3. Use the `dump-ui-hierarchy` MCP tool (see Section 8) to programmatically verify accessibility labels

### 5.4 Multi-Screen Testing

Run the same APK on multiple emulators simultaneously to compare layouts:

```bash
# Terminal 1
emulator -avd Pixel_7_API_34 &

# Terminal 2
emulator -avd Pixel_Tablet_API_34 &

# Terminal 3
emulator -avd Small_Phone_API_30 &

# Install on all
adb devices  # Lists all three
adb -s emulator-5554 install captivet.apk
adb -s emulator-5556 install captivet.apk
adb -s emulator-5558 install captivet.apk
```

Take screenshots of the same screen on each device and compare side by side.

---

## 6. Crash & Log Investigation

### 6.1 Logcat in Android Studio

1. **View > Tool Windows > Logcat**
2. Set filter to your app: select `com.captivet.mobile` from the process dropdown
3. Filter by severity: click Error (E) to see only errors

**Key log tags for Captivet:**

| Tag | Source | What it shows |
|-----|--------|--------------|
| `ReactNativeJS` | Hermes engine | JS console.log, console.error, unhandled rejections |
| `ExpoAV` | expo-av | Audio recording events, errors |
| `ExpoSecureStore` | expo-secure-store | Keystore access failures |
| `OkHttp` | Network layer | HTTP request/response details |
| `ActivityManager` | Android system | Activity lifecycle, ANR detection |
| `AndroidRuntime` | Android system | Fatal crashes with full stack trace |
| `HermesVM` | Hermes | JS engine crashes, OOM |

### 6.2 Filtering for crashes

In the Logcat filter bar:

```
# Show only fatal crashes for your app
package:com.captivet.mobile level:ERROR tag:AndroidRuntime

# Show Hermes JS errors
package:com.captivet.mobile tag:ReactNativeJS level:ERROR

# Show all SecureStore/Keystore issues
package:com.captivet.mobile tag:ExpoSecureStore OR tag:KeyStore
```

### 6.3 ANR (Application Not Responding) detection

ANRs occur when the main thread is blocked for >5 seconds. Android Studio shows ANR events in Logcat with tag `ActivityManager`.

To force-detect ANR conditions:

1. Open the Profiler and attach to `com.captivet.mobile`
2. Look for main thread blocks >5 seconds in the CPU trace
3. Common Captivet ANR scenarios:
   - Synchronous SecureStore read on app resume
   - Blocking network call during auth refresh
   - Heavy computation in a `useEffect` on mount

### 6.4 Simulating crash scenarios

Use the emulator to test Captivet's crash prevention rules:

| Scenario | How to simulate | What should happen |
|----------|----------------|-------------------|
| Keystore corruption | Clear app data mid-session | SecureStore wrapper returns graceful fallback |
| Network loss during upload | Toggle airplane mode | Upload fails with user-visible error |
| Low memory | Start many apps on emulator | App handles OOM without data loss |
| Audio interruption | Trigger a phone call during recording | expo-av `stopAndUnloadAsync` wrapped in try/catch |
| Permission revocation | Revoke microphone permission in Settings during recording | Graceful error, not a crash |

To clear app data:

```bash
adb shell pm clear com.captivet.mobile
```

To simulate a phone call on emulator:

```bash
adb shell am start -a android.intent.action.CALL -d tel:5551234
```

To revoke microphone permission:

```bash
adb shell pm revoke com.captivet.mobile android.permission.RECORD_AUDIO
```

---

## 7. APK Analysis

### 7.1 Opening an APK in Android Studio

1. **Build > Analyze APK...**
2. Select your EAS-built APK file
3. Android Studio shows:

| Section | What to check |
|---------|--------------|
| **APK size** | Total download size. Target <25 MB for fast installs |
| **classes.dex** | DEX files — method count, referenced methods |
| **res/** | Resources — images, layouts (NativeWind generates minimal native resources) |
| **lib/** | Native libraries — libjsc.so or libhermes.so, arch-specific |
| **assets/** | JS bundle, fonts, embedded assets |
| **AndroidManifest.xml** | Permissions declared, activities, intent filters |

### 7.2 Comparing two APKs

After making changes, compare APK sizes:

1. Open the first APK via **Build > Analyze APK...**
2. Click **"Compare with previous APK..."** in the top-right
3. Select the second APK
4. Review size differences by file/directory

This is useful for verifying that:
- Adding a new dependency didn't bloat the bundle
- Removing dead code actually reduced size
- Native library architecture includes only needed ABIs

### 7.3 Checking permissions

In the APK Analyzer, click `AndroidManifest.xml` and verify Captivet only declares expected permissions:

```xml
<!-- Expected permissions for Captivet -->
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.USE_BIOMETRIC" />
<uses-permission android:name="android.permission.VIBRATE" />

<!-- Should NOT be present -->
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.READ_CONTACTS" />
```

---

## 8. Claude Code MCP Integration

The `android-mcp-toolkit` MCP server provides direct device interaction from within Claude Code conversations. This is the bridge between Android Studio's device management and Claude's code intelligence.

### 8.1 Available MCP tools

| Tool | Command | Use case |
|------|---------|----------|
| `take-screenshot` | Capture device screen to PNG | UI review, visual regression |
| `dump-ui-hierarchy` | Export view tree as XML | Accessibility audit, layout structure |
| `inject-input` | Send tap/swipe/text/key events | Automated interaction sequences |
| `manage-logcat` | Read, filter, clear device logs | Crash investigation, runtime debugging |
| `get-current-activity` | Show focused Activity/Window | Navigation state verification |
| `convert-svg-to-android-drawable` | SVG to VectorDrawable XML | Icon asset conversion |
| `estimate-text-length-difference` | Compare text lengths | Internationalization string fitting |

### 8.2 Using MCP tools in Claude Code

These tools are available in any Claude Code conversation when the MCP server is running. You interact with them by asking Claude naturally:

**Screenshot-based UI review:**
```
"Take a screenshot of the app and tell me if the recording button
is properly centered and large enough for easy tapping."
```

**Accessibility audit:**
```
"Dump the UI hierarchy of the current screen and check if all
interactive elements have content descriptions for TalkBack."
```

**Automated testing sequence:**
```
"Navigate to the recording screen by tapping the Record tab,
then tap the record button, wait 5 seconds, and tap stop.
Take a screenshot after each step."
```

**Log-based crash investigation:**
```
"Read the last 100 logcat entries filtered by ERROR level for
com.captivet.mobile. Look for any unhandled promise rejections
or native crashes."
```

**Foreign language string fitting:**
```
"Compare the English string 'Patient Name' with the Spanish
translation 'Nombre del Paciente' and check if the length
difference will cause UI overflow."
```

### 8.3 MCP + Android Studio together

The MCP tools work on the same device/emulator that Android Studio connects to. A typical combined workflow:

1. **Android Studio:** Attach Profiler to the running app
2. **Claude Code (MCP):** `inject-input` to perform a series of user interactions
3. **Android Studio:** Observe CPU/memory/network impact of those interactions
4. **Claude Code (MCP):** `take-screenshot` and `dump-ui-hierarchy` to capture final state
5. **Claude Code:** Analyze results and suggest code changes

This gives you automated reproducible test sequences with full performance visibility.

---

## 9. Combined Workflows (Step-by-Step Recipes)

### Recipe 1: Profile the Recording Pipeline

**Goal:** Measure CPU, memory, and network usage during a complete record-upload-poll cycle.

```
Step 1: Setup
  - Start emulator (or use physical Pixel)
  - Install latest preview APK
  - Open Android Studio Profiler, attach to com.captivet.mobile
  - Log in to the app

Step 2: Baseline
  - Let the app sit idle for 30 seconds
  - Note baseline CPU usage (should be <5%)
  - Note baseline memory (heap size)
  - Note no network activity

Step 3: Record (2-minute test recording)
  - Start CPU trace recording in Profiler
  - In Claude Code: "Tap the Record tab, then tap the record button"
  - Wait 2 minutes (watch CPU and memory in real-time)
  - In Claude Code: "Tap the stop button"
  - Stop CPU trace recording

Step 4: Upload
  - In Claude Code: "Fill in patient name 'TestDog', species 'Canine',
    and tap Submit"
  - Watch Network Profiler for the 4-step upload sequence
  - Verify: Audio PUT goes to R2, not your API server
  - Note upload time and payload size

Step 5: Poll
  - Watch Network Profiler for GET requests every 5 seconds
  - Verify polling stops when status reaches 'completed' or 'failed'

Step 6: Analyze
  - In Claude Code: "Take a screenshot of the final SOAP note screen"
  - Review CPU trace for main thread blocks >16ms
  - Review memory for leaks (heap should return to near-baseline)
  - Share specific findings with Claude for optimization
```

### Recipe 2: UI/UX Accessibility Audit

**Goal:** Verify all screens meet accessibility and usability standards.

```
Step 1: Setup
  - Start emulator with Pixel 7 profile
  - Install preview APK
  - Enable "Show layout bounds" in Developer Options

Step 2: Screen-by-screen audit
  For each screen (Login, Recordings List, Record, Patient Form, SOAP Note):

  a. Navigate to the screen
  b. In Claude Code:
     "Take a screenshot of the current screen"
     "Dump the UI hierarchy and check for:
      - Elements missing contentDescription
      - Touch targets smaller than 48dp
      - Text elements without sufficient contrast
      - Focusable elements not in logical order"

  c. In Android Studio Layout Inspector:
     - Check view depth (flag anything >10 levels deep)
     - Check for unnecessary View wrappers
     - Verify padding/margin consistency

  d. Record findings in a table:
     | Screen | Issue | Severity | Fix |
     |--------|-------|----------|-----|

Step 3: Multi-device comparison
  - Install on Pixel Tablet emulator
  - Repeat screenshot capture for each screen
  - Compare tablet vs phone layouts:
    - Is the recording button still easy to reach?
    - Does the SOAP note use the extra width well?
    - Are list items appropriately sized?

Step 4: TalkBack verification
  - Enable TalkBack on emulator
  - Navigate through each screen using swipe gestures
  - Verify every interactive element is announced meaningfully
  - Check that the recording timer is announced periodically

Step 5: Report
  - Compile findings into a prioritized list
  - In Claude Code: "Based on these accessibility issues, generate
    the code changes needed to fix them"
```

### Recipe 3: Crash Scenario Testing

**Goal:** Verify all crash prevention rules from CLAUDE.md hold under stress.

```
Step 1: Setup
  - Start emulator
  - Install preview APK
  - Open Android Studio Logcat, filter: package:com.captivet.mobile level:ERROR

Step 2: Test each crash prevention rule

  Rule 2 (async callbacks):
  - Start a recording
  - In Claude Code: "Read logcat for any unhandled promise rejections"
  - Toggle switches, press all buttons rapidly
  - Check logcat for rejected promises

  Rule 3 (SecureStore):
  - Clear app data: adb shell pm clear com.captivet.mobile
  - Reopen app
  - Check that login screen appears (not a crash)
  - Check logcat for Keystore errors (should be caught)

  Rule 7 (expo-av):
  - Start recording
  - Simulate phone call: adb shell am start -a android.intent.action.CALL -d tel:5551234
  - Dismiss call, return to app
  - Check logcat — should see caught error, not crash
  - App should show error alert, not blank screen

  Rule 9 (Haptics):
  - Test on Budget_Phone emulator (no haptic motor)
  - Tap every button in the app
  - Check logcat — Haptics rejections should be caught

  Rule 10 (Sign-out):
  - Enable airplane mode on emulator
  - Tap sign out
  - App should clear local state and return to login
  - Check logcat for caught network error

Step 3: Report
  - Any uncaught crash = critical bug, fix immediately
  - In Claude Code: "Read logcat for the last 200 lines and identify
    any ERROR entries from our app"
```

### Recipe 4: Network Resilience Testing

**Goal:** Verify the app handles poor/no network gracefully.

```
Step 1: Setup
  - Start emulator
  - Install preview APK
  - Open Android Studio Network Profiler

Step 2: Test scenarios

  Slow upload:
  - Set emulator network to EDGE (slow)
  - Record a 2-minute audio (should be ~2 MB)
  - Start upload
  - Watch Network Profiler for the PUT to R2
  - Verify: Upload progress feedback in UI? Timeout handling?

  Network loss during upload:
  - Start an upload
  - Mid-upload, toggle airplane mode
  - Verify: Error message shown to user, recording not lost
  - Disable airplane mode
  - Verify: Can retry the upload

  Network loss during polling:
  - Complete an upload, start polling
  - Toggle airplane mode
  - Verify: Polling pauses, no crash
  - Disable airplane mode
  - Verify: Polling resumes, SOAP note eventually loads

  Offline app launch:
  - Enable airplane mode
  - Launch the app
  - Verify: Login screen appears with appropriate offline message
  - Verify: No crash from failed Supabase connection

Step 3: In Claude Code
  "Read logcat for any network-related errors or unhandled rejections
   from the last test run"
```

### Recipe 5: Automated Visual Regression

**Goal:** Capture baseline screenshots and detect visual changes after code updates.

```
Step 1: Capture baseline (before changes)
  - Install current APK on emulator
  - For each key screen, in Claude Code:
    "Navigate to [screen] and take a screenshot"
  - Save screenshots to a local directory:
    docs/screenshots/baseline/

Step 2: Make code changes
  - Apply your changes
  - Build new APK or use dev server with hot reload

Step 3: Capture comparison (after changes)
  - For each screen, repeat the same navigation + screenshot
  - Save to docs/screenshots/current/

Step 4: Review
  - In Claude Code:
    "Compare the baseline and current screenshots of the recording
     screen. Identify any visual differences in layout, spacing,
     color, or text."
  - Claude can visually compare the images and describe differences

Step 5: Iterate
  - Fix any unintended visual changes
  - Re-capture until screenshots match expectations
```

---

## 10. Limitations & Workarounds

### What Android Studio CANNOT do with Expo managed workflow

| Limitation | Why | Workaround |
|------------|-----|------------|
| Can't open project in Android Studio | No `android/` directory (managed workflow) | Use Android Studio only for device tools, not as IDE |
| Can't build from Android Studio | No `build.gradle` — Expo generates at build time | Continue using `eas build` or `npx expo run:android` |
| Can't edit native code | No Kotlin/Java source committed | Use Expo config plugins for native modifications |
| Can't use XML layout editor | Layouts are React Native/NativeWind | Use Layout Inspector for read-only inspection |
| Profiler detail limited on release builds | Release APKs strip debug info | Use development builds for full method traces |
| Emulator lacks real microphone quality | Emulator mic is host computer mic | Use physical device for audio quality testing |

### When to use physical device vs. emulator

| Test type | Use physical device (Pixel) | Use emulator |
|-----------|---------------------------|--------------|
| Audio recording quality | Yes | No |
| Haptic feedback feel | Yes | No |
| Biometric auth (fingerprint) | Yes | Limited |
| Performance profiling | Both | Both |
| UI layout testing | Yes (your target device) | Yes (for other screen sizes) |
| Network condition testing | Harder to control | Easy (built-in controls) |
| Crash reproduction | Both | Both |
| Automated MCP interaction | Both | Both |

### Profiler with release builds

Release APKs (from `eas build --profile preview`) are not debuggable by default. The Profiler can still attach and show system-level metrics (CPU %, memory usage, network calls), but cannot show:
- Individual method traces
- Heap allocation stacks
- Request/response bodies

For full profiling detail, create a debuggable development build:

```bash
# Generate native project with debug config
npx expo prebuild --platform android

# Open in Android Studio
# File > Open > select the generated android/ directory

# Run from Android Studio with profiling enabled
# Run > Profile 'app'
```

**Warning:** `npx expo prebuild` generates an `android/` directory. This is gitignored and should not be committed. Delete it when done:

```bash
rm -rf android/
```

### Emulator microphone for recording tests

The emulator uses your laptop's microphone. For testing the recording pipeline flow (record, upload, process), this is fine. For testing audio quality or transcription accuracy, always use your physical Pixel.

To enable microphone in the emulator:
1. Start the emulator
2. Extended Controls (...) > Microphone
3. Enable "Virtual microphone uses host audio input"

---

## Quick Reference Card

### Common ADB commands for Captivet testing

```bash
# List all connected devices
adb devices

# Install APK on specific device
adb -s <device> install captivet.apk

# Uninstall
adb -s <device> uninstall com.captivet.mobile

# Clear app data (reset to fresh install)
adb shell pm clear com.captivet.mobile

# Pull a file from device (e.g., a crash log)
adb pull /data/anr/traces.txt ./

# Forward port (for connecting to Expo dev server from emulator)
adb reverse tcp:8081 tcp:8081

# Take a screenshot via ADB
adb exec-out screencap -p > screenshot.png

# Record screen (30 seconds max)
adb shell screenrecord /sdcard/recording.mp4 --time-limit 30
adb pull /sdcard/recording.mp4 ./

# Simulate low memory
adb shell am send-trim-memory com.captivet.mobile RUNNING_CRITICAL

# Check app permissions
adb shell dumpsys package com.captivet.mobile | grep permission
```

### Android Studio keyboard shortcuts (Linux)

| Action | Shortcut |
|--------|----------|
| Open Profiler | Alt+6 |
| Open Logcat | Alt+6, then Logcat tab |
| Open Layout Inspector | Tools > Layout Inspector |
| Open APK Analyzer | Build > Analyze APK |
| Open Device Manager | Tools > Device Manager |
| Toggle tool window | Ctrl+Shift+F12 |
| Find action | Ctrl+Shift+A |

### Claude Code MCP quick commands

```
"Take a screenshot and analyze the UI"
"Dump the UI hierarchy for accessibility issues"
"Read the last 50 logcat errors for com.captivet.mobile"
"Clear logcat and start fresh"
"What activity is currently focused?"
"Tap at coordinates 540, 960"
"Type 'TestDog' into the focused field"
"Swipe up on the screen"
```
