// Central hook for all Groq API interactions
import { useCallback } from 'react';

const GROQ_BASE = 'https://api.groq.com/openai/v1';
const TRANSCRIPTION_MODEL = 'whisper-large-v3';
const CHAT_MODEL = 'openai/gpt-oss-120b';

// Robustly extract suggestions array from any JSON shape the model returns
function parseSuggestions(raw) {
  // Strip markdown code fences if present
  const cleaned = raw.replace(/```json|```/gi, '').trim();
  const parsed = JSON.parse(cleaned);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.suggestions)) return parsed.suggestions;
  // Sometimes model wraps in a different key — find first array value
  for (const val of Object.values(parsed)) {
    if (Array.isArray(val)) return val;
  }
  throw new Error('Failed to find suggestions array in response');
}

export function useGroq(apiKey) {

  // Transcribe an audio blob via Whisper
  const transcribe = useCallback(async (audioBlob) => {
    if (!apiKey) throw new Error('No API key set');

    // Use the detected mime type from the blob, fallback to webm
    const ext = audioBlob.type.includes('mp4') ? 'audio.mp4'
      : audioBlob.type.includes('ogg') ? 'audio.ogg'
      : 'audio.webm';

    const form = new FormData();
    form.append('file', audioBlob, ext);
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
    const context = transcript.slice(-contextWindow);

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
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: `TRANSCRIPT:\n${context}\n\nReturn exactly 3 suggestions as JSON. You MUST include exactly 3 items in the suggestions array.` },
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Suggestions failed: ${res.status}`);
    }

    const data = await res.json();
    const raw = data.choices[0].message.content;

    try {
      const suggestions = parseSuggestions(raw);
      if (!suggestions?.length) throw new Error('Empty suggestions array');
      return suggestions;
    } catch (e) {
      throw new Error(`Failed to generate JSON. Please adjust your prompt. See 'failed_generation' for more details.`);
    }
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

    return streamResponse(res, onChunk);
  }, [apiKey]);

  // Send a chat message (streaming)
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

    return streamResponse(res, onChunk);
  }, [apiKey]);

  return { transcribe, getSuggestions, expandSuggestion, chat };
}

// Shared SSE stream reader
async function streamResponse(res, onChunk) {
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
      } catch { /* skip malformed SSE */ }
    }
  }
  return full;
}