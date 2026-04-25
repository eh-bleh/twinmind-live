import { useState, useCallback, useRef, useEffect } from 'react';
import { Settings, Download } from 'lucide-react';
import { TranscriptColumn } from './components/TranscriptColumn';
import { SuggestionsColumn } from './components/SuggestionsColumn';
import { ChatColumn } from './components/ChatColumn';
import { SettingsModal } from './components/SettingsModal';
import { useGroq } from './hooks/useGroq';
import { useAudio } from './hooks/useAudio';
import { loadSettings, saveSettings } from './config';

const ts = () =>
  new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

const uid = () => Math.random().toString(36).slice(2, 9);

const SUGGEST_INTERVAL_MS = 30000;

export default function App() {
  const [settings, setSettings] = useState(loadSettings);
  const [showSettings, setShowSettings] = useState(!loadSettings().apiKey);

  // Transcript state
  const [transcriptBlocks, setTranscriptBlocks] = useState([]);
  const fullTranscriptRef = useRef('');

  // Suggestions state
  const [suggestionBatches, setSuggestionBatches] = useState([]);
  const [isSuggestionsLoading, setIsSuggestionsLoading] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(null);

  // Chat state
  const [chatMessages, setChatMessages] = useState([]);
  const [isChatResponding, setIsChatResponding] = useState(false);

  const { transcribe, getSuggestions, expandSuggestion, chat } = useGroq(settings.apiKey);

  // ── Audio → Transcription ──────────────────────────────────────────────────
  const handleAudioChunk = useCallback(async (blob) => {
    if (!settings.apiKey) return;
    try {
      const text = await transcribe(blob);
      if (!text?.trim()) return;

      const block = { id: uid(), text: text.trim(), timestamp: ts() };
      setTranscriptBlocks(prev => [...prev, block]);
      fullTranscriptRef.current += '\n' + text.trim();
    } catch (err) {
      console.error('Transcription error:', err);
    }
  }, [settings.apiKey, transcribe]);

  const { isRecording, error: micError, start, stop, forceFlush } = useAudio(handleAudioChunk);

  // ── Live Suggestion Refresh ────────────────────────────────────────────────
  const refreshSuggestions = useCallback(async () => {
    const transcript = fullTranscriptRef.current.trim();
    if (!transcript || !settings.apiKey) return;

    setIsSuggestionsLoading(true);
    try {
      const suggestions = await getSuggestions(
        transcript,
        settings.suggestionPrompt,
        settings.suggestionContextWindow
      );
      if (!suggestions?.length) return;

      const batch = { id: uid(), timestamp: ts(), suggestions };
      setSuggestionBatches(prev => [batch, ...prev]);
    } catch (err) {
      console.error('Suggestions error:', err);
    } finally {
      setIsSuggestionsLoading(false);
    }
  }, [settings, getSuggestions]);

  // Manual refresh: flush audio first, then regenerate suggestions
  const handleManualRefresh = useCallback(() => {
    forceFlush();
    setTimeout(refreshSuggestions, 800); // small delay for transcription to land
  }, [forceFlush, refreshSuggestions]);

  // Auto-refresh suggestions every 30s while recording
  const suggestIntervalRef = useRef(null);
  useEffect(() => {
    if (isRecording) {
      suggestIntervalRef.current = setInterval(refreshSuggestions, SUGGEST_INTERVAL_MS);
    } else {
      clearInterval(suggestIntervalRef.current);
    }
    return () => clearInterval(suggestIntervalRef.current);
  }, [isRecording, refreshSuggestions]);

  // ── Chat ───────────────────────────────────────────────────────────────────
  const sendChatMessage = useCallback(async (text) => {
    const userMsg = { id: uid(), role: 'user', content: text, timestamp: ts() };
    setChatMessages(prev => [...prev, userMsg]);
    setIsChatResponding(true);

    const assistantId = uid();
    let accumulated = '';

    // Add a placeholder message we'll stream into
    setChatMessages(prev => [
      ...prev,
      { id: assistantId, role: 'assistant', content: '', timestamp: ts() },
    ]);

    const history = [...chatMessages, userMsg].map(m => ({
      role: m.role,
      content: m.content,
    }));

    try {
      await chat(
        history,
        settings.chatPrompt,
        fullTranscriptRef.current,
        settings.chatContextWindow,
        (delta) => {
          accumulated += delta;
          setChatMessages(prev =>
            prev.map(m => m.id === assistantId ? { ...m, content: accumulated } : m)
          );
        }
      );
    } catch (err) {
      setChatMessages(prev =>
        prev.map(m =>
          m.id === assistantId
            ? { ...m, content: `Error: ${err.message}` }
            : m
        )
      );
    } finally {
      setIsChatResponding(false);
    }
  }, [chat, chatMessages, settings]);

  // Clicking a suggestion → use detailPrompt for richer expanded answer
  const handleSelectSuggestion = useCallback((suggestion) => {
    setActiveSuggestion(suggestion);

    const userMsg = { id: uid(), role: 'user', content: `**${suggestion.type.toUpperCase()}**: ${suggestion.preview}`, timestamp: ts() };
    const assistantId = uid();
    let accumulated = '';

    setChatMessages(prev => [
      ...prev,
      userMsg,
      { id: assistantId, role: 'assistant', content: '', timestamp: ts() },
    ]);
    setIsChatResponding(true);

    expandSuggestion(
      suggestion,
      settings.detailPrompt,
      fullTranscriptRef.current,
      settings.detailContextWindow,
      (delta) => {
        accumulated += delta;
        setChatMessages(prev =>
          prev.map(m => m.id === assistantId ? { ...m, content: accumulated } : m)
        );
      }
    ).catch(err => {
      setChatMessages(prev =>
        prev.map(m => m.id === assistantId ? { ...m, content: `Error: ${err.message}` } : m)
      );
    }).finally(() => setIsChatResponding(false));
  }, [expandSuggestion, settings]);

  // ── Settings ───────────────────────────────────────────────────────────────
  const handleSaveSettings = (newSettings) => {
    setSettings(newSettings);
    saveSettings(newSettings);
  };

  // ── Export ─────────────────────────────────────────────────────────────────
  const handleExport = () => {
    const data = {
      exportedAt: new Date().toISOString(),
      transcript: transcriptBlocks.map(b => `[${b.timestamp}] ${b.text}`).join('\n'),
      suggestionBatches: suggestionBatches.map(b => ({
        timestamp: b.timestamp,
        suggestions: b.suggestions,
      })),
      chat: chatMessages.map(m => `[${m.timestamp}] ${m.role.toUpperCase()}: ${m.content}`).join('\n\n'),
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `twinmind-session-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="app">
      {/* Top bar */}
      <header className="topbar">
        <div className="topbar-left">
          <span className="logo">TWINMIND</span>
          <span className="session-badge">
            {isRecording ? '● LIVE' : '○ IDLE'}
          </span>
        </div>
        <div className="topbar-right">
          <button className="btn" onClick={handleExport} title="Export session">
            <Download size={12} />
            EXPORT
          </button>
          <button className="btn" onClick={() => setShowSettings(true)}>
            <Settings size={12} />
            SETTINGS
          </button>
        </div>
      </header>

      {/* Three columns */}
      <TranscriptColumn
        isRecording={isRecording}
        transcriptBlocks={transcriptBlocks}
        onStart={start}
        onStop={stop}
        micError={micError}
      />

      <SuggestionsColumn
        batches={suggestionBatches}
        isLoading={isSuggestionsLoading}
        onRefresh={handleManualRefresh}
        onSelectSuggestion={handleSelectSuggestion}
        activeSuggestion={activeSuggestion}
      />

      <ChatColumn
        messages={chatMessages}
        isResponding={isChatResponding}
        onSend={sendChatMessage}
      />

      {/* Settings modal */}
      {showSettings && (
        <SettingsModal
          settings={settings}
          onSave={handleSaveSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
