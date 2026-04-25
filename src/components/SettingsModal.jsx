import { useState } from 'react';
import { X } from 'lucide-react';
import { DEFAULT_SETTINGS } from '../config';

export function SettingsModal({ settings, onSave, onClose }) {
  const [draft, setDraft] = useState(settings);

  const set = (key, value) => setDraft(prev => ({ ...prev, [key]: value }));

  const handleSave = () => {
    onSave(draft);
    onClose();
  };

  const handleReset = () => {
    setDraft(DEFAULT_SETTINGS);
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="modal-title">SETTINGS</span>
          <button className="btn btn-icon" onClick={onClose}><X size={14} /></button>
        </div>

        <div className="field">
          <label className="field-label">Groq API Key</label>
          <input
            className="field-input"
            type="password"
            placeholder="gsk_..."
            value={draft.apiKey}
            onChange={(e) => set('apiKey', e.target.value)}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
          <div className="field">
            <label className="field-label">Suggestion Context (chars)</label>
            <input
              className="field-input"
              type="number"
              value={draft.suggestionContextWindow}
              onChange={(e) => set('suggestionContextWindow', Number(e.target.value))}
            />
          </div>
          <div className="field">
            <label className="field-label">Detail Context (chars)</label>
            <input
              className="field-input"
              type="number"
              value={draft.detailContextWindow}
              onChange={(e) => set('detailContextWindow', Number(e.target.value))}
            />
          </div>
          <div className="field">
            <label className="field-label">Chat Context (chars)</label>
            <input
              className="field-input"
              type="number"
              value={draft.chatContextWindow}
              onChange={(e) => set('chatContextWindow', Number(e.target.value))}
            />
          </div>
        </div>

        <div className="field">
          <label className="field-label">Live Suggestion Prompt</label>
          <textarea
            className="field-input field-textarea"
            style={{ minHeight: '160px' }}
            value={draft.suggestionPrompt}
            onChange={(e) => set('suggestionPrompt', e.target.value)}
          />
        </div>

        <div className="field">
          <label className="field-label">Expanded Answer Prompt (on suggestion click)</label>
          <textarea
            className="field-input field-textarea"
            value={draft.detailPrompt}
            onChange={(e) => set('detailPrompt', e.target.value)}
          />
        </div>

        <div className="field">
          <label className="field-label">Chat System Prompt</label>
          <textarea
            className="field-input field-textarea"
            value={draft.chatPrompt}
            onChange={(e) => set('chatPrompt', e.target.value)}
          />
        </div>

        <div className="modal-footer">
          <button className="btn" onClick={handleReset}>Reset Defaults</button>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-accent" onClick={handleSave}>Save Settings</button>
        </div>
      </div>
    </div>
  );
}
