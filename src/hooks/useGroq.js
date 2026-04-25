// Central hook for all Groq API interactions
import { useCallback } from 'react';

const GROQ_BASE = 'https://api.groq.com/openai/v1';
const TRANSCRIPTION_MODEL = 'whisper-large-v3';
const CHAT_MODEL = 'openai/gpt-oss-120b';

export function useGroq(apiKey) {
  // Transcribe an audio blob via Whisper
  const transcribe = useCallback(async (audioBlob) => {
    if (!apiKey) throw new Error('No API key set');
    const form = new FormData();
    form.append('file', audioBlob, 'audio.webm');
    form.append('model', TRANSCRIPTION_MODEL);
    form.append('response_format', 'text');

    const res = await fetch(`${GROQ_BASE}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Transcription failed: ${res.status}`);
    }

    return res.text();
  }, [apiKey]);

  // Generate suggestions (non-streaming, returns parsed array)
  const getSuggestions = useCallback(async (transcript, prompt, contextWindow) => {
    if (!apiKey) throw new Error('No API key set');

    // Use only the last N characters of the transcript
    const context = transcript.slice(-contextWindow);

    const res = await fetch(`${GROQ_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        max_tokens: 600,
        temperature: 0.4,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: prompt,
          },
          {
            role: 'user',
            content: `TRANSCRIPT:\n${context}\n\nReturn exactly 3 suggestions as JSON.`,
          },
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Suggestions failed: ${res.status}`);
    }

    const data = await res.json();
    const raw = data.choices[0].message.content;
    const parsed = JSON.parse(raw);
    // Accept either { suggestions: [...] } or [...] directly
    return Array.isArray(parsed) ? parsed : parsed.suggestions;
  }, [apiKey]);

  // Expand a clicked suggestion using the detail prompt (streaming)
  const expandSuggestion = useCallback(async (suggestion, detailPrompt, transcript, contextWindow, onChunk) => {
    if (!apiKey) throw new Error('No API key set');
    const context = transcript.slice(-contextWindow);
    const system = `${detailPrompt}\n\nCURRENT TRANSCRIPT CONTEXT:\n${context}`;
    const userMessage = `The user clicked this suggestion card:\nType: ${suggestion.type}\nPreview: ${suggestion.preview}\n\nProvide a detailed, expanded answer.`;

    const res = await fetch(`${GROQ_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        max_tokens: 800,
        temperature: 0.4,
        stream: true,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userMessage },
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Detail fetch failed: ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let full = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(l => l.startsWith('data: '));
      for (const line of lines) {
        const json = line.slice(6);
        if (json === '[DONE]') continue;
        try {
          const parsed = JSON.parse(json);
          const delta = parsed.choices?.[0]?.delta?.content || '';
          if (delta) { full += delta; onChunk(delta); }
        } catch { /* skip */ }
      }
    }
    return full;
  }, [apiKey]);

  // Send a chat message (streaming), calls onChunk(delta) as tokens arrive
  const chat = useCallback(async (messages, systemPrompt, transcript, contextWindow, onChunk) => {
    if (!apiKey) throw new Error('No API key set');

    const context = transcript.slice(-contextWindow);
    const system = `${systemPrompt}\n\nCURRENT TRANSCRIPT CONTEXT:\n${context}`;

    const res = await fetch(`${GROQ_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        max_tokens: 1000,
        temperature: 0.5,
        stream: true,
        messages: [
          { role: 'system', content: system },
          ...messages,
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Chat failed: ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let full = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(l => l.startsWith('data: '));
      for (const line of lines) {
        const json = line.slice(6);
        if (json === '[DONE]') continue;
        try {
          const parsed = JSON.parse(json);
          const delta = parsed.choices?.[0]?.delta?.content || '';
          if (delta) {
            full += delta;
            onChunk(delta);
          }
        } catch {
          // skip malformed SSE lines
        }
      }
    }

    return full;
  }, [apiKey]);

  return { transcribe, getSuggestions, expandSuggestion, chat };
}