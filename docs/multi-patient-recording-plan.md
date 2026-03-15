# Multi-Patient Recording Feature — Implementation Plan

## Context

Veterinarians sometimes see multiple patients in a single exam room during one appointment period. Currently, the app only supports recording one patient at a time — the vet must complete the entire record-and-upload cycle before starting the next patient. This feature adds the ability to create multiple patient slots, record each separately, and batch-upload all recordings at the end of the session.

**Server impact: None.** Each recording is already a standalone entity on the server (`POST /api/recordings` accepts a single `CreateRecording`). The multi-patient feature is purely a mobile UI/state management change. Each patient's recording will be uploaded independently using the existing `recordingsApi.createWithFile()` flow.

---

## Architecture Overview

### Core Concept: Patient Slots

A **session** contains any number of `PatientSlot` objects (no hard cap). Each slot holds its own form data and a reference to its completed audio file. Only ONE native recorder exists (hardware constraint) — it is "bound" to whichever slot is actively recording. When recording stops, the `audioUri` and duration are captured into that slot, freeing the recorder for the next patient. Adding a new patient is a single tap — the app scrolls to the new slot instantly, ready for input.

### State Management: `useReducer`

A `useMultiPatientSession` hook manages the slot array, active index, and recorder binding via `useReducer`. This prevents stale-closure bugs in async recording callbacks and makes state transitions atomic.

### Single Recorder, Multiple Slots

The existing `useAudioRecorder()` hook is called once. A `recorderBoundToSlotId` field in state tracks which slot currently owns the recorder. When recording stops, the audio URI is saved to that slot and the binding is cleared.

---

## Files Created

1. `src/types/multiPatient.ts` — PatientSlot, SessionAction, SessionState types
2. `src/hooks/useMultiPatientSession.ts` — useReducer-based session state management
3. `src/components/PatientTabStrip.tsx` — Horizontal tab navigation with status dots
4. `src/components/PatientSlotCard.tsx` — Full-width per-patient page with form + recording controls + submit
5. `src/components/SubmitPanel.tsx` — Bottom "Submit All Recordings" bar

## Files Modified

1. `app/(app)/record.tsx` — Major refactor to use multi-patient session hook + new components
2. `src/components/PatientForm.tsx` — Added optional `clientNameDisabled` prop

## Unchanged Files

- `src/hooks/useAudioRecorder.ts` — Used as-is; single instance shared across slots
- `src/api/recordings.ts` — `createWithFile()` called once per slot; no API changes
- `src/api/client.ts` — No changes to HTTP layer
- `src/types/index.ts` — Existing types unchanged; new types in separate file
- `src/components/AudioWaveform.tsx` — Rendered inside PatientSlotCard, no API changes
- `src/components/ui/Button.tsx` — Reused as-is
- `src/components/ui/Card.tsx` — Reused as-is
- `src/components/ui/Badge.tsx` — Reused as-is

---

## Key Design Decisions

- **Effect-based audio capture**: After `recorder.stop()`, the audio URI is captured via a React effect that watches `recorder.state === 'stopped'` and `recorder.audioUri`, avoiding React state-batching bugs where reading `recorder.audioUri` immediately after `await recorder.stop()` returns stale values.
- **Ref-based cross-function coordination**: `startRecordingRef` and `pendingStartSlotRef` handle the async "stop slot A, then start slot B" flow without stale closures.
- **clientName propagation**: The reducer's `UPDATE_FORM` action for `clientName` applies the value to ALL slots, matching the real-world scenario of multiple pets belonging to the same client.

---

## Edge Cases Handled

| Scenario | Handling |
|---|---|
| Many patients | No hard cap; tab strip scrolls; dots → "3 of 8" text at >6 |
| Swipe during recording | Auto-pause; "Paused" badge on return |
| Record on B while A paused | Prompt to stop A; save audio; start B |
| Remove patient with active recording | Confirm alert; stop recording; delete audio file |
| Navigate away with unsaved | usePreventRemove confirmation alert |
| Upload failure for one patient | Mark failed; continue others; show retry |
| App killed during session | Temp files lost (acceptable, matches current behavior) |

---

## Crash Prevention Compliance

- Every `Haptics.*Async()` has `.catch(() => {})`
- Every `recorder.*` call wrapped in try/catch
- No raw async functions passed to void callbacks
- Loading state cleanup in `finally` blocks
- `FileSystem.deleteAsync()` on removed slot audio has `.catch(() => {})`
- `queryClient.invalidateQueries()` has `.catch(() => {})`
