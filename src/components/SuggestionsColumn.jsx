import { RefreshCw } from 'lucide-react';

const TYPE_LABELS = {
  question: { label: 'Question to Ask', cls: 'type-question' },
  answer: { label: 'Answer', cls: 'type-answer' },
  'fact-check': { label: 'Fact Check', cls: 'type-fact-check' },
  'talking-point': { label: 'Talking Point', cls: 'type-talking-point' },
  clarification: { label: 'Clarification', cls: 'type-clarification' },
};

function SuggestionCard({ suggestion, onSelect, isActive }) {
  const meta = TYPE_LABELS[suggestion.type] || { label: suggestion.type, cls: 'type-answer' };

  return (
    <button
      className={`suggestion-card ${isActive ? 'active' : ''}`}
      onClick={() => onSelect(suggestion)}
    >
      <div className={`suggestion-type ${meta.cls}`}>{meta.label}</div>
      <div className="suggestion-preview">{suggestion.preview}</div>
    </button>
  );
}

export function SuggestionsColumn({ batches, isLoading, onRefresh, onSelectSuggestion, activeSuggestion }) {
  return (
    <div className="col">
      <div className="col-header">
        <span className="col-title">Live Suggestions</span>
        <button
          className="btn btn-icon"
          onClick={onRefresh}
          disabled={isLoading}
          title="Refresh suggestions"
        >
          <RefreshCw size={12} style={{ animation: isLoading ? 'spin 1s linear infinite' : 'none' }} />
        </button>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>

      <div className="col-body">
        {isLoading && (
          <div className="suggestion-batch">
            <div className="batch-label">GENERATING...</div>
            <div className="shimmer" />
            <div className="shimmer" style={{ opacity: 0.7 }} />
            <div className="shimmer" style={{ opacity: 0.4 }} />
          </div>
        )}

        {!isLoading && batches.length === 0 && (
          <div className="empty-state" style={{ flex: 1 }}>
            <div className="empty-state-icon">💡</div>
            <div className="empty-state-text">
              Suggestions appear once<br />
              the transcript has content.
            </div>
          </div>
        )}

        {batches.map((batch, batchIdx) => (
          <div key={batch.id} className="suggestion-batch">
            <div className="batch-label">
              {batchIdx === 0 ? `LATEST · ${batch.timestamp}` : batch.timestamp}
            </div>
            {batch.suggestions.map((s, i) => (
              <SuggestionCard
                key={i}
                suggestion={s}
                onSelect={onSelectSuggestion}
                isActive={activeSuggestion?.preview === s.preview}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
