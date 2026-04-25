import { useState, useRef, useCallback, useEffect } from 'react';

const CHUNK_INTERVAL_MS = 30000;

function getSupportedMimeType() {
  // Prefer opus formats which Whisper handles best
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

  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);
  const chunksRef = useRef([]);
  const mimeTypeRef = useRef('');
  const onChunkRef = useRef(onChunk);

  useEffect(() => { onChunkRef.current = onChunk; }, [onChunk]);

  const flush = useCallback(() => {
    if (chunksRef.current.length === 0) return;
    const mime = mimeTypeRef.current || 'audio/webm';
    const blob = new Blob(chunksRef.current, { type: mime });
    chunksRef.current = [];

    // Only send if blob is large enough to contain real audio (>2KB)
    if (blob.size > 2000) {
      onChunkRef.current(blob);
    }
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

      const mimeType = getSupportedMimeType();
      mimeTypeRef.current = mimeType;
      const options = mimeType ? { mimeType } : {};

      const mr = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mr;

      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      // Request data every 5s so chunks accumulate properly
      mr.start(5000);
      setIsRecording(true);

      // Flush every 30s for transcription
      intervalRef.current = setInterval(flush, CHUNK_INTERVAL_MS);
    } catch (err) {
      setError(err.message || 'Microphone access denied');
    }
  }, [flush]);

  const stop = useCallback(() => {
    clearInterval(intervalRef.current);

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.requestData(); // grab final chunk
      mediaRecorderRef.current.stop();
    }

    setTimeout(flush, 800);
    streamRef.current?.getTracks().forEach(t => t.stop());
    setIsRecording(false);
  }, [flush]);

  const forceFlush = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.requestData(); // force data collection now
    }
    setTimeout(flush, 300);
  }, [flush]);

  return { isRecording, error, start, stop, forceFlush };
}