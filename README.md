# TwinMind Live Suggestions

A real-time AI meeting copilot that listens to live audio, transcribes speech, and continuously surfaces 3 contextually relevant suggestions while you talk. Built for the TwinMind engineering assignment.

**Live demo:** https://twinmind-live-ten.vercel.app  
**GitHub:** https://github.com/eh-bleh/twinmind-live

---

## Setup

1. Clone the repo and install dependencies:
   ```bash
   git clone https://github.com/eh-bleh/twinmind-live.git
   cd twinmind-live
   npm install
   npm run dev
   ```

2. Open `http://localhost:5173` in your browser

3. Click **Settings**, paste your [Groq API key](https://console.groq.com), and click **Save Settings**

4. Click **Start Recording** and allow microphone access

No environment variables or build-time secrets required — the API key is entered at runtime by the user and stored in `localStorage`.

---

## Stack

| Layer | Choice | Reason |
|---|---|---|
| Framework | React + Vite | Fast HMR, zero config, ideal for single-page tools |
| Styling | Plain CSS with CSS variables | No build step overhead, full control over design tokens |
| Transcription | Groq Whisper Large V3 | Required by spec; excellent accuracy at high speed |
| LLM | Groq GPT-OSS 120B | Required by spec; used for both suggestions and chat |
| Hosting | Vercel | Zero-config Vite deployment, instant CDN |
| State | React hooks only | No Redux needed — session state fits cleanly in `useState` + `useRef` |

The entire app is client-side. There is no backend server — all Groq API calls are made directly from the browser using the user's own API key.

---

## Architecture

```
src/
  hooks/
    useAudio.js      # Mic access, MediaRecorder, 30s chunking
    useGroq.js       # All Groq API calls: transcribe, getSuggestions, expandSuggestion, chat
  components/
    TranscriptColumn.jsx    # Left column: mic control + transcript blocks
    SuggestionsColumn.jsx   # Middle column: suggestion cards + batch history
    ChatColumn.jsx          # Right column: streaming chat interface
    SettingsModal.jsx       # API key + all editable prompts and settings
  config.js          # Default settings and prompts (the prompt engineering lives here)
  App.jsx            # Top-level state, orchestration, auto-refresh loop
  index.css          # Design system: CSS variables, layout, components
```

### Audio pipeline
`MediaRecorder` collects audio in 1-second chunks. Every 30 seconds (or on manual refresh), accumulated chunks are flushed into a single `Blob` and sent to Whisper for transcription. The mime type is detected at runtime (`audio/webm;codecs=opus` preferred, with fallbacks) to ensure cross-browser compatibility. Transcribed text is appended to a running full-transcript string used as context for all AI calls.

### Suggestion refresh loop
While recording, `setInterval` fires every 30 seconds to generate a new batch of 3 suggestions. Manual refresh flushes pending audio first, waits 800ms for transcription to land, then generates suggestions. Each batch is prepended to the suggestion list so the newest always appears at the top.

### Streaming chat
Chat responses stream token-by-token using the Groq SSE API. The assistant message is added to state immediately with empty content, then updated character-by-character as tokens arrive — giving instant visual feedback with no perceived latency.

---

## Prompt Strategy

Three separate prompts handle three distinct jobs:

### 1. Live Suggestion Prompt
**Goal:** Generate exactly 3 suggestions that are immediately useful, even without clicking.

**Key decisions:**
- Explicitly enforced "EXACTLY 3 suggestions — no more, no fewer" with a hard requirement stated twice. Without this, the model would return 2 suggestions on short transcripts.
- Five suggestion types defined: `question`, `answer`, `fact-check`, `talking-point`, `clarification`. The model chooses the right mix based on what just happened in the conversation.
- Context routing rules: if a question was asked → at least one `answer`; if a factual claim was made → include a `fact-check`. This ensures suggestions feel responsive to the conversation rather than generic.
- The `preview` field must be self-contained value (1-2 sentences). A card that just says "Click for more" is useless. The preview should already help.
- Uses `response_format: { type: 'json_object' }` for reliable structured output. Temperature set to 0.4 for consistency with some creativity.
- **Context window:** Last 4,000 characters of transcript. Recency matters more than completeness for suggestions.

### 2. Expanded Answer Prompt (on suggestion click)
**Goal:** Go deeper than the card preview when the user wants more detail.

**Key decisions:**
- Completely separate from the chat prompt. Clicking a card is a different intent than asking a free-form question — it's asking for elaboration on a specific point, so the prompt focuses on depth and specificity over conversational tone.
- Instructs the model to open with the key insight immediately, no preamble.
- **Context window:** Last 8,000 characters — more context than suggestions since depth requires understanding more of the conversation.

### 3. Chat Prompt
**Goal:** Answer free-form questions about the conversation in a direct, conversational way.

**Key decisions:**
- Explicitly bans filler phrases ("Great question!", "Certainly!") which erode trust in an assistant tool.
- Full transcript context (last 12,000 characters) since the user may reference anything said earlier.
- Streaming enabled for immediate perceived responsiveness.

### What context gets passed
| Call | Context window | What's included |
|---|---|---|
| Suggestions | Last 4,000 chars | Recent transcript only |
| Expanded answer | Last 8,000 chars | Recent transcript + suggestion type/preview |
| Chat | Last 12,000 chars | Full recent transcript + full chat history |

The context windows are tunable in Settings. The asymmetry is intentional: suggestions need recency, chat answers need completeness.

---

## Settings (all editable at runtime)

| Setting | Default | Purpose |
|---|---|---|
| Groq API Key | — | User-supplied, stored in localStorage |
| Suggestion Context Window | 4,000 chars | Transcript chars passed to suggestion prompt |
| Detail Context Window | 8,000 chars | Transcript chars passed to expanded answer prompt |
| Chat Context Window | 12,000 chars | Transcript chars passed to chat prompt |
| Live Suggestion Prompt | See config.js | Full system prompt for suggestion generation |
| Expanded Answer Prompt | See config.js | System prompt for suggestion card click |
| Chat System Prompt | See config.js | System prompt for free-form chat |

---

## Tradeoffs

**Client-side only vs. backend**  
All API calls go directly from the browser to Groq. This means the API key is visible in localStorage and network requests. For a production app, calls would go through a backend proxy. For this assignment, client-side keeps the architecture simple and eliminates deployment complexity.

**30-second chunk size**  
Shorter chunks (e.g., 10s) would give faster transcription updates but produce more fragmented text that's harder for Whisper to contextualize. 30 seconds balances latency against transcription quality. The manual refresh button compensates when the user wants an immediate update.

**No streaming for suggestions**  
Suggestions use a non-streaming JSON response. Streaming JSON is complex to parse incrementally and suggestions aren't useful until all 3 are ready anyway. The shimmer loading state covers the ~1-2 second wait.

**localStorage for settings**  
Simple and effective for a single-user tool with no login requirement. Settings persist across page reloads without any backend.

**Batch history in suggestions column**  
Older suggestion batches stay visible below the latest. This lets users reference suggestions from earlier in the conversation — useful in longer meetings where a point raised 5 minutes ago becomes relevant again.

---

## What I'd improve with more time

- **Speaker diarization** — label who said what in the transcript for better suggestion context
- **Backend proxy** — move Groq calls server-side to protect the API key
- **Smarter context selection** — instead of a fixed character window, use semantic chunking to pass the most relevant parts of the transcript
- **Suggestion deduplication** — avoid surfacing the same insight across multiple refresh batches
- **Mobile layout** — the 3-column layout collapses on small screens
