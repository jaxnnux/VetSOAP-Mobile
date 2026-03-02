# VetSOAP Mobile — Project Guidelines

## Architecture

- **Framework:** Expo SDK 55, React Native 0.83, React 19
- **Routing:** expo-router (file-based, `app/` directory)
- **State:** React Query for server state, React context for auth
- **Styling:** NativeWind v4 (Tailwind CSS via `global.css`)
- **Auth:** Supabase Auth with `expo-secure-store` token persistence
- **Build:** EAS Build (managed workflow, no bare `android/` or `ios/` committed)

## Critical Crash Prevention Rules

These rules come from production crash audits. Violating them will cause crashes on Android APKs.

### 1. Never throw at module load time in production

`src/config.ts` exports a `CONFIG_MISSING` flag instead of throwing. `src/auth/supabase.ts` uses a placeholder Supabase client when config is missing. Any new module-level initialization that depends on env vars or external state **must** degrade gracefully — never `throw` at the top level.

### 2. Never pass raw `async` functions to void-returning callbacks

React Native callbacks (`onPress`, `onValueChange`, `AppState.addEventListener`, `Alert.onPress`, `Switch.onValueChange`, `RefreshControl.onRefresh`) are typed as returning `void`. Passing an `async` function discards the returned Promise. On Hermes (Android production), an unhandled promise rejection from a discarded Promise is a **fatal crash**.

**Always** wrap async work in try/catch when called from these callbacks:

```tsx
// BAD — unhandled rejection crashes Hermes
<Switch onValueChange={async (v) => { await doThing(v); }} />

// GOOD
<Switch onValueChange={(v) => {
  doThing(v).catch((e) => console.error(e));
}} />

// ALSO GOOD
const handleChange = async (v: boolean) => {
  try { await doThing(v); } catch (e) { console.error(e); }
};
<Switch onValueChange={handleChange} />
```

### 3. Always wrap SecureStore / Keystore operations in try/catch

`expo-secure-store` delegates to Android Keystore which can throw in real-world scenarios:
- Keystore corruption after failed OS updates
- Direct Boot mode (before first unlock)
- Low storage conditions
- Key permanently invalidated after screen lock changes

`src/lib/secureStorage.ts` and `src/lib/biometrics.ts` wrap every call. **Never** call `SecureStore.*` directly elsewhere — always go through these wrappers.

### 4. Never fire-and-forget Promises without `.catch()`

Any Promise that is not `await`-ed **must** have a `.catch()` or be inside a try/catch. Common offenders:

```tsx
// BAD — if setToken rejects, app crashes
secureStorage.setToken(token);

// GOOD
secureStorage.setToken(token).catch(() => {});

// GOOD
await secureStorage.setToken(token); // inside a try/catch block
```

### 5. Always use `finally` for loading state cleanup

If a function sets `isLoading = true`, the `false` reset **must** be in a `finally` block, not after the await. Otherwise, any thrown exception leaves the UI permanently stuck in a loading state.

```tsx
// BAD — isLoading stuck on throw
setIsLoading(true);
const result = await signIn(email, password);
setIsLoading(false);

// GOOD
setIsLoading(true);
try {
  const result = await signIn(email, password);
} finally {
  setIsLoading(false);
}
```

### 6. Guard biometric/auth async flows in AppState handlers

`AppState.addEventListener('change', handler)` discards async return values. The handler **must** have an outer try/catch, and `isAuthenticating` state must be reset in a `finally` block. Otherwise a biometric hardware error permanently locks the app with no escape.

### 7. expo-av recording operations can throw at any time

`pauseAsync()`, `startAsync()`, `stopAndUnloadAsync()` throw if the audio session is interrupted (phone call, audio focus lost, permission revoked). Callers in `record.tsx` must `await` these and wrap in try/catch with user-visible error feedback (Alert).

### 8. Keep `validateRequestUrl()` inside the try block in `ApiClient.request()`

SSL pinning validation must be inside the try/catch so the `finally` block can still run `clearTimeout(timeout)`. Moving it outside causes timer leaks and uncaught exceptions.

### 9. Always add `.catch(() => {})` to Haptics calls

Every `Haptics.*Async()` call (`impactAsync`, `selectionAsync`, `notificationAsync`) returns a Promise that rejects on devices without haptic hardware (tablets, emulators, budget phones). Since Haptics calls are always fire-and-forget inside sync callbacks, the rejected Promise is unhandled — fatal on Hermes.

```tsx
// BAD — crashes on devices without haptic motor
Haptics.selectionAsync();

// GOOD
Haptics.selectionAsync().catch(() => {});
```

This applies everywhere including the shared `Button` component (`src/components/ui/Button.tsx`), which runs on every button press in the app.

### 10. Sign-out must always clear local state, even if the server call fails

`handleSignOut` in `AuthProvider.tsx` wraps `supabase.auth.signOut()` in try/catch so that `secureStorage.clearAll()`, `setUser(null)`, and `setSession(null)` always run. Without this, a network error during sign-out leaves the user stuck — authenticated in UI state but with a broken session.

### 11. Audio recorder hook must recover from native failures

`useAudioRecorder` operations (`stop`, `pause`, `resume`) call expo-av methods that can throw at any time. The `stop()` callback wraps `stopAndUnloadAsync()` in try/catch so that hook state (`state`, `audioUri`, `recordingRef`) is always cleaned up even if the native call fails. Without this, a single failure permanently corrupts the hook — subsequent interactions crash.

Additionally, the recording status callback must be deregistered on unmount (`setOnRecordingStatusUpdate(null)`) to prevent `setDuration` from firing after the component unmounts.

### 12. Validate local file reads before upload

In `recordingsApi.createWithFile()`, always check `fileResponse.ok` after `fetch(fileUri)` and verify `blob.size > 0` before proceeding with the upload. A missing or empty audio file (OS reclaimed temp storage, interrupted recording) should throw a user-friendly error rather than silently uploading a 0-byte file.

### 13. Guard `response.json()` results against null and unexpected shapes

API error bodies can be literal `null` (valid JSON). Always use `?? {}` after `.catch(() => ({}))` on error-path `response.json()` calls. Similarly, use `Array.isArray()` to validate array fields like `details` before calling `.map()`.

### 14. Guard `new Date()` before calling Intl formatting methods

`new Date(null)` or `new Date(undefined)` produces an "Invalid Date" object. On Hermes, calling `.toLocaleDateString()` with Intl options on an Invalid Date throws a `RangeError`. Always check `isNaN(parsedDate.getTime())` before formatting.

### 15. Wrap `refetch` before passing to RefreshControl/onRefresh

React Query's `refetch()` returns a Promise. `RefreshControl.onRefresh` is typed as `() => void`, so the Promise is discarded. Wrap it: `() => { refetch().catch(() => {}); }`.

## EAS Build Notes

- **Secrets:** `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` are stored as EAS project-level secrets (not in `eas.json`)
- **Credentials:** Preview profile uses `credentialsSource: "local"` with `credentials.json` + `android/keystores/vetsoap.jks` (both gitignored)
- **Lock file:** Must stay in sync — run `npm install` before EAS builds if dependencies change. EAS uses `npm ci` which fails on mismatch.

## File Conventions

- `src/lib/secureStorage.ts` — sole interface to `expo-secure-store`. All calls wrapped in try/catch.
- `src/lib/biometrics.ts` — sole interface to `expo-local-authentication` + biometric SecureStore preference. All calls wrapped in try/catch.
- `src/config.ts` — env var access with graceful fallback. Exports `CONFIG_MISSING` flag.
- `app/_layout.tsx` — gates entire app on `CONFIG_MISSING` before any providers mount. Root `ErrorBoundary` wraps entire component tree.
- `src/components/ui/Button.tsx` — shared button with haptic feedback. `Haptics.impactAsync` has `.catch()`. Every button press flows through this component.
- `src/hooks/useAudioRecorder.ts` — wraps expo-av recording. `stop()` has internal try/catch for state recovery. Status callback deregistered on unmount.
- `src/auth/AuthProvider.tsx` — `handleSignOut` wraps server call in try/catch so local cleanup always runs. Fire-and-forget promises in session restore have `.catch()`.
- `src/api/recordings.ts` — `createWithFile()` validates file response and blob size before upload.
