import { useEffect, useRef } from 'react';
import { Mic, Square } from 'lucide-react';

export function TranscriptColumn({ isRecording, transcriptBlocks, onStart, onStop, micError }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcriptBlocks]);

  return (
    <div className="col">
      <div className="col-header">
        <span className="col-title">Transcript</span>
        <div className="status-dot" style={{ background: isRecording ? 'var(--recording)' : undefined }} />
      </div>

      <div className="col-body">
        <button
          className={`mic-btn ${isRecording ? 'recording' : ''}`}
          onClick={isRecording ? onStop : onStart}
        >
          {isRecording ? (
            <><div className="mic-dot" /><Square size={13} />STOP RECORDING</>
          ) : (
            <><Mic size={13} />START RECORDING</>
          )}
        </button>

        {micError && (
          <div style={{
            padding: '8px 12px', borderRadius: '6px',
            background: 'rgba(255,68,68,0.1)', border: '1px solid rgba(255,68,68,0.3)',
            color: '#ff6b6b', fontSize: '11px', fontFamily: 'var(--font-mono)',
          }}>
            ⚠ {micError}
          </div>
        )}

        {transcriptBlocks.length === 0 ? (
          <div className="empty-state" style={{ flex: 1 }}>
            <div className="empty-state-icon">🎙</div>
            <div className="empty-state-text">Press record to begin.<br />Transcript appears every ~30s.</div>
          </div>
        ) : (
          transcriptBlocks.map((block, i) => (
            <div key={block.id} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', animation: 'fadeIn 0.3s ease' }}>
              {/* Timestamp inline with text — matches prototype */}
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '9px',
                color: 'var(--text-muted)',
                whiteSpace: 'nowrap',
                paddingTop: '3px',
                flexShrink: 0,
              }}>
                {block.timestamp}
              </span>
              <span style={{
                fontSize: '13px',
                color: i === transcriptBlocks.length - 1 ? 'var(--text-primary)' : 'var(--text-secondary)',
                lineHeight: '1.7',
              }}>
                {block.text}
              </span>
            </div>
          ))
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
