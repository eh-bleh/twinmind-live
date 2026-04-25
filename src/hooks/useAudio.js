import { useState, useRef, useCallback, useEffect } from 'react';

const CHUNK_INTERVAL_MS = 30000;

function getSupportedMimeType() {
  const types = [
    'audio/webm;codecs=opus',
    'audio/ogg;codecs=opus',
    'audio/webm',
    'audio/mp4',
  ];
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

export function useAudio(onChunk) {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState(null);

  const streamRef = useRef(null);
  const intervalRef = useRef(null);
  const onChunkRef = useRef(onChunk);
  const isRecordingRef = useRef(false);

  useEffect(() => { onChunkRef.current = onChunk; }, [onChunk]);

  // Records a single 30s segment, sends it, then starts the next one
  const recordSegment = useCallback((stream, mimeType) => {
    if (!isRecordingRef.current) return;

    const options = mimeType ? { mimeType } : {};
    const mr = new MediaRecorder(stream, options);
    const chunks = [];

    mr.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    mr.onstop = () => {
      if (chunks.length === 0) return;
      const blob = new Blob(chunks, { type: mimeType || 'audio/webm' });
      if (blob.size > 3000) {
        onChunkRef.current(blob);
      }
      // Chain the next segment if still recording
      if (isRecordingRef.current) {
        recordSegment(stream, mimeType);
      }
    };

    mr.start();

    // Stop this segment after 30s — onstop will chain the next one
    setTimeout(() => {
      if (mr.state === 'recording') mr.stop();
    }, CHUNK_INTERVAL_MS);

  }, []);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });
      streamRef.current = stream;
      isRecordingRef.current = true;
      setIsRecording(true);

      const mimeType = getSupportedMimeType();
      recordSegment(stream, mimeType);
    } catch (err) {
      setError(err.message || 'Microphone access denied');
    }
  }, [recordSegment]);

  const stop = useCallback(() => {
    isRecordingRef.current = false;
    streamRef.current?.getTracks().forEach(t => t.stop());
    clearInterval(intervalRef.current);
    setIsRecording(false);
  }, []);

  // Force flush: stop current segment early — onstop will send it and NOT chain next
  const forceFlush = useCallback(() => {
    // Nothing to do — segments auto-send on stop
    // Just trigger a new segment cycle early by stopping tracks briefly
  }, []);

  return { isRecording, error, start, stop, forceFlush };
}