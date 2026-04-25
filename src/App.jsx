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

  const [transcriptBlocks, setTranscriptBlocks] = useState([]);
  const fullTranscriptRef = useRef('');

  const [suggestionBatches, setSuggestionBatches] = useState([]);
  const [isSuggestionsLoading, setIsSuggestionsLoading] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(null);
  const [countdown, setCountdown] = useState(30);

  const [chatMessages, setChatMessages] = useState([]);
  const [isChatResponding, setIsChatResponding] = useState(false);

  const { transcribe, getSuggestions, expandSuggestion, chat } = useGroq(settings.apiKey);

  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  const handleAudioChunk = useCallback(async (blob) => {
    if (!settingsRef.current.apiKey) return;
    try {
      const text = await transcribe(blob);
      if (!text?.trim()) return;
      const block = { id: uid(), text: text.trim(), timestamp: ts() };
      setTranscriptBlocks(prev => [...prev, block]);
      fullTranscriptRef.current += '\n' + text.trim();
    } catch (err) {
      console.error('Transcription error:', err);
    }
  }, [transcribe]);

  const { isRecording, error: micError, start, stop, forceFlush } = useAudio(handleAudioChunk);

  const refreshSuggestionsRef = useRef(null);

  const refreshSuggestions = useCallback(async () => {
    const transcript = fullTranscriptRef.current.trim();
    const s = settingsRef.current;
    if (!transcript || !s.apiKey) return;
    setIsSuggestionsLoading(true);
    setCountdown(30);
    try {
      const suggestions = await getSuggestions(transcript, s.suggestionPrompt, s.suggestionContextWindow);
      if (!suggestions?.length) return;
      const batch = { id: uid(), timestamp: ts(), suggestions };
      setSuggestionBatches(prev => [batch, ...prev]);
    } catch (err) {
      console.error('Suggestions error:', err);
    } finally {
      setIsSuggestionsLoading(false);
    }
  }, [getSuggestions]);

  useEffect(() => { refreshSuggestionsRef.current = refreshSuggestions; }, [refreshSuggestions]);

  const suggestIntervalRef = useRef(null);
  const countdownIntervalRef = useRef(null);
  const isRecordingRef = useRef(false);
  useEffect(() => { isRecordingRef.current = isRecording; }, [isRecording]);

  useEffect(() => {
    if (isRecording) {
      setCountdown(30);
      suggestIntervalRef.current = setInterval(() => {
        if (isRecordingRef.current) refreshSuggestionsRef.current?.();
      }, SUGGEST_INTERVAL_MS);
      countdownIntervalRef.current = setInterval(() => {
        setCountdown(prev => (prev <= 1 ? 30 : prev - 1));
      }, 1000);
    } else {
      clearInterval(suggestIntervalRef.current);
      clearInterval(countdownIntervalRef.current);
      setCountdown(30);
    }
    return () => {
      clearInterval(suggestIntervalRef.current);
      clearInterval(countdownIntervalRef.current);
    };
  }, [isRecording]);

  const handleManualRefresh = useCallback(() => {
    forceFlush();
    setTimeout(() => refreshSuggestionsRef.current?.(), 800);
  }, [forceFlush]);

  const sendChatMessage = useCallback(async (text) => {
    const userMsg = { id: uid(), role: 'user', content: text, timestamp: ts() };
    setChatMessages(prev => [...prev, userMsg]);
    setIsChatResponding(true);
    const assistantId = uid();
    let accumulated = '';
    setChatMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '', timestamp: ts() }]);
    const history = [...chatMessages, userMsg].map(m => ({ role: m.role, content: m.content }));
    try {
      await chat(history, settingsRef.current.chatPrompt, fullTranscriptRef.current, settingsRef.current.chatContextWindow, (delta) => {
        accumulated += delta;
        setChatMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: accumulated } : m));
      });
    } catch (err) {
      setChatMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: `Error: ${err.message}` } : m));
    } finally {
      setIsChatResponding(false);
    }
  }, [chat, chatMessages]);

  const handleSelectSuggestion = useCallback((suggestion) => {
    setActiveSuggestion(suggestion);
    const userMsg = { id: uid(), role: 'user', content: `**${suggestion.type.toUpperCase()}**: ${suggestion.preview}`, timestamp: ts() };
    const assistantId = uid();
    let accumulated = '';
    setChatMessages(prev => [...prev, userMsg, { id: assistantId, role: 'assistant', content: '', timestamp: ts() }]);
    setIsChatResponding(true);
    const s = settingsRef.current;
    expandSuggestion(suggestion, s.detailPrompt, fullTranscriptRef.current, s.detailContextWindow, (delta) => {
      accumulated += delta;
      setChatMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: accumulated } : m));
    }).catch(err => {
      setChatMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: `Error: ${err.message}` } : m));
    }).finally(() => setIsChatResponding(false));
  }, [expandSuggestion]);

  const handleSaveSettings = (newSettings) => {
    setSettings(newSettings);
    saveSettings(newSettings);
  };

  const handleExport = () => {
    const data = {
      exportedAt: new Date().toISOString(),
      transcript: transcriptBlocks.map(b => `[${b.timestamp}] ${b.text}`).join('\n'),
      suggestionBatches: suggestionBatches.map(b => ({ timestamp: b.timestamp, suggestions: b.suggestions })),
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
      <header className="topbar">
        <div className="topbar-left">
          <span className="logo">TWINMIND</span>
          <span className="session-badge">{isRecording ? '● LIVE' : '○ IDLE'}</span>
        </div>
        <div className="topbar-right">
          <button className="btn" onClick={handleExport}><Download size={12} />EXPORT</button>
          <button className="btn" onClick={() => setShowSettings(true)}><Settings size={12} />SETTINGS</button>
        </div>
      </header>
      <TranscriptColumn isRecording={isRecording} transcriptBlocks={transcriptBlocks} onStart={start} onStop={stop} micError={micError} />
      <SuggestionsColumn batches={suggestionBatches} isLoading={isSuggestionsLoading} onRefresh={handleManualRefresh} onSelectSuggestion={handleSelectSuggestion} activeSuggestion={activeSuggestion} countdown={countdown} isRecording={isRecording} />
      <ChatColumn messages={chatMessages} isResponding={isChatResponding} onSend={sendChatMessage} />
      {showSettings && <SettingsModal settings={settings} onSave={handleSaveSettings} onClose={() => setShowSettings(false)} />}
    </div>
  );
}
