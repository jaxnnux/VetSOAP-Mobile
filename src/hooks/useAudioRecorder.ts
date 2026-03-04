import { useState, useCallback, useRef, useEffect } from 'react';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';

export type RecordingState = 'idle' | 'recording' | 'paused' | 'stopped';

export interface UseAudioRecorderReturn {
  state: RecordingState;
  duration: number;
  audioUri: string | null;
  mimeType: string;
  start: () => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  stop: () => Promise<void>;
  reset: () => void;
  isSupported: boolean;
  permissionGranted: boolean;
}

const RECORDING_OPTIONS: Audio.RecordingOptions = {
  android: {
    extension: '.m4a',
    outputFormat: Audio.AndroidOutputFormat.MPEG_4,
    audioEncoder: Audio.AndroidAudioEncoder.AAC,
    sampleRate: 44100,
    numberOfChannels: 1,
    bitRate: 128000,
  },
  ios: {
    extension: '.m4a',
    audioQuality: Audio.IOSAudioQuality.HIGH,
    sampleRate: 44100,
    numberOfChannels: 1,
    bitRate: 128000,
    outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
  },
  web: {
    mimeType: 'audio/webm;codecs=opus',
    bitsPerSecond: 128000,
  },
};

export function useAudioRecorder(): UseAudioRecorderReturn {
  const [state, setState] = useState<RecordingState>('idle');
  const [duration, setDuration] = useState(0);
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [permissionGranted, setPermissionGranted] = useState(false);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const stoppingRef = useRef(false);

  // Request permissions on mount
  useEffect(() => {
    Audio.requestPermissionsAsync().then(({ granted }) => {
      setPermissionGranted(granted);
    }).catch(() => {});
  }, []);

  const isStartingRef = useRef(false);

  const start = useCallback(async () => {
    if (isStartingRef.current || state !== 'idle') return;
    isStartingRef.current = true;
    try {
    if (!permissionGranted) {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        throw new Error('Microphone permission not granted');
      }
      setPermissionGranted(true);
    }

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });

    const recording = new Audio.Recording();
    try {
      await recording.prepareToRecordAsync(RECORDING_OPTIONS);

      recording.setOnRecordingStatusUpdate((status) => {
        if (status.isRecording && status.durationMillis) {
          setDuration(Math.floor(status.durationMillis / 1000));
        }
      });

      await recording.startAsync();
    } catch (error) {
      // Clean up the partially-initialized recording to avoid a zombie object
      recording.setOnRecordingStatusUpdate(null);
      await recording.stopAndUnloadAsync().catch(() => {});
      throw error;
    }
    recordingRef.current = recording;

    setState('recording');
    setDuration(0);
    setAudioUri(null);
    } finally {
      isStartingRef.current = false;
    }
  }, [permissionGranted, state]);

  const pause = useCallback(async () => {
    if (recordingRef.current) {
      try {
        await recordingRef.current.pauseAsync();
        setState('paused');
      } catch (error) {
        console.error('[AudioRecorder] pauseAsync failed:', error);
        // Native handle is broken — clean up so user can start fresh
        recordingRef.current.setOnRecordingStatusUpdate(null);
        const uri = (() => { try { return recordingRef.current?.getURI() ?? null; } catch { return null; } })();
        await recordingRef.current.stopAndUnloadAsync().catch(() => {});
        setAudioUri(uri);
        recordingRef.current = null;
        setState('stopped');
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {});
      }
    }
  }, []);

  const resume = useCallback(async () => {
    if (recordingRef.current) {
      try {
        await recordingRef.current.startAsync();
        setState('recording');
      } catch (error) {
        console.error('[AudioRecorder] startAsync (resume) failed:', error);
        // Native handle is broken — clean up so user can start fresh
        recordingRef.current.setOnRecordingStatusUpdate(null);
        const uri = (() => { try { return recordingRef.current?.getURI() ?? null; } catch { return null; } })();
        await recordingRef.current.stopAndUnloadAsync().catch(() => {});
        setAudioUri(uri);
        recordingRef.current = null;
        setState('stopped');
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {});
      }
    }
  }, []);

  const stop = useCallback(async () => {
    if (recordingRef.current && !stoppingRef.current) {
      stoppingRef.current = true;
      recordingRef.current.setOnRecordingStatusUpdate(null);
      const uri = (() => { try { return recordingRef.current?.getURI() ?? null; } catch { return null; } })();
      try {
        await recordingRef.current.stopAndUnloadAsync();
      } catch (error) {
        console.error('[AudioRecorder] stopAndUnloadAsync failed:', error);
      }
      setAudioUri(uri);
      recordingRef.current = null;
      setState('stopped');

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
      }).catch(() => {});
    }
  }, []);

  const reset = useCallback(() => {
    if (audioUri) {
      FileSystem.deleteAsync(audioUri, { idempotent: true }).catch(() => {});
    }
    setState('idle');
    setDuration(0);
    setAudioUri(null);
    recordingRef.current = null;
    stoppingRef.current = false;
  }, [audioUri]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recordingRef.current && !stoppingRef.current) {
        stoppingRef.current = true;
        recordingRef.current.setOnRecordingStatusUpdate(null);
        const uri = (() => { try { return recordingRef.current?.getURI() ?? null; } catch { return null; } })();
        recordingRef.current.stopAndUnloadAsync().then(() => {
          if (uri) FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
        }).catch(() => {
          if (uri) FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
        });
      }
    };
  }, []);

  return {
    state,
    duration,
    audioUri,
    mimeType: 'audio/x-m4a',
    start,
    pause,
    resume,
    stop,
    reset,
    isSupported: true,
    permissionGranted,
  };
}
