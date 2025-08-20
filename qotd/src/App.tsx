import React, { useEffect, useMemo, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

const FontLoader = () => (
  <style>
    {`
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500&family=Playfair+Display:wght@400;600;700&display=swap');
    :root { --quote-font: 'Playfair Display', Georgia, serif; --ui-font: Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, 'Apple Color Emoji', 'Segoe UI Emoji'; }
    html, body, #root { height: 100%; }
    body { margin:0; min-height:100vh; background: radial-gradient(1200px 700px at 10% 5%, #f7fafc 0%, #ffffff 60%),
                    radial-gradient(1200px 700px at 90% 95%, #f7fafc 0%, #ffffff 60%); }
    * { box-sizing: border-box; }

    .page { min-height: 100vh; display: grid; place-items: center; }
    .container { width: min(1100px, 92vw); padding: 24px; text-align: center; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:16px; }
    .quote { font-family: var(--quote-font); font-size: clamp(28px, 6vw, 49px); line-height: 1.2; color: #000000ff; letter-spacing: 0.3px; }
    .author { font-family: var(--ui-font); margin-top: 0px; color: #4b5563; font-size: clamp(14px, 2vw, 18px); }

    .controls-wrap { position: fixed; bottom: 38px; left: 0; right: 0; display: flex; justify-content: center; }
    .controls { display: inline-flex; align-items: center; gap: 18px; background: rgba(255,255,255,0.75); border: 1px solid #e5e7eb; padding: 10px 16px; border-radius: 999px; backdrop-filter: blur(6px); box-shadow: 0 6px 24px rgba(0,0,0,0.06); }
    .date { font-family: var(--ui-font); color: #374151; font-size: 15px; display: inline-flex; align-items: center; gap: 8px; }
    .btn { width: 36px; height: 36px; display: grid; place-items: center; border-radius: 999px; border: 1px solid #e5e7eb; background: white; cursor: pointer; transition: transform .06s ease, background .15s ease, box-shadow .15s ease; }
    .btn:hover { background: #f9fafb; box-shadow: 0 2px 12px rgba(0,0,0,0.05); }
    .btn:active { transform: translateY(1px) scale(0.98); }
    .btn:focus-visible { outline: 3px solid #bfdbfe; outline-offset: 2px; }
    .btn:disabled { opacity: 0.4; cursor: not-allowed; box-shadow: none; }

    .calendar { width: 18px; height: 18px; }
    .chev { width: 16px; height: 16px; }

    .muted { color: #6b7280; font-family: var(--ui-font); margin-top: 12px; }
    .error { color:#6b7280; font-family:var(--ui-font); }
    .retry { margin-top:4px; padding:8px 12px; border-radius:999px; border:1px solid #e5e7eb; background:white; cursor:pointer; }

    @media (max-width: 480px) {
      .controls { gap: 12px; padding: 8px 12px; }
      .btn { width: 32px; height: 32px; }
      .date { font-size: 14px; }
    }
  `}
  </style>
);

function addDays(d: Date, delta: number) { const nd = new Date(d); nd.setDate(nd.getDate() + delta); return nd; }
function formatDateParam(d: Date) { return d.toISOString().slice(0,10); }
function formatDateLabel(target: Date, today = new Date()) {
  const isToday = target.toDateString() === today.toDateString();
  if (isToday) return "Today";
  return target.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

export default function App() {
  const [offset, setOffset] = useState(0); // 0 = today
  const base = useMemo(() => new Date(), []);
  const currentDate = useMemo(() => addDays(base, offset), [base, offset]);
  const dateLabel = useMemo(() => formatDateLabel(currentDate, base), [currentDate, base]);

  const [quote, setQuote] = useState<{text:string; author:string} | null>(null);
  const [status, setStatus] = useState<'idle'|'loading'|'error'>('idle');
  const [lastError, setLastError] = useState<string | null>(null);

  const load = React.useCallback(async (target: Date) => {
    setStatus('loading');
    setQuote(null);
    setLastError(null);
    try {
      const date = formatDateParam(target);
      const res = await fetch(`${API_BASE}/quote?date=${date}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setQuote({ text: data.text, author: data.author });
      setStatus('idle');
    } catch (e:any) {
      setStatus('error');
      setLastError(e?.message || 'Unknown error');
    }
  }, []);

  useEffect(() => { load(currentDate); }, [currentDate, load]);

  // keyboard navigation: ← and → 
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') setOffset(o => o - 1);
      if (e.key === 'ArrowRight' && offset < 0) setOffset(o => o + 1); // only allow right if not at today
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [offset]);

  return (
    <div className="page">
      <FontLoader />
      <main className="container" role="main" aria-live="polite">
        {status === 'loading' && (
          <div className="muted">Loading quote…</div>
        )}
        {status === 'error' && (
          <div style={{display:'flex', flexDirection:'column', alignItems:'center'}}>
            <div className="error">Could not load quote. Please try again.</div>
            {lastError && <div className="muted" style={{fontSize:12}}>Details: {lastError}</div>}
            <button className="retry" onClick={() => load(currentDate)}>Retry</button>
          </div>
        )}
        {quote && (
          <>
            <blockquote className="quote">“{quote.text}”</blockquote>
            <div className="author">— {quote.author}</div>
          </>
        )}
      </main>

      <div className="controls-wrap">
        <div className="controls" aria-label="Quote date controls">
          <button className="btn" aria-label="Previous day" onClick={() => setOffset(o => o - 1)}>
            <svg className="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
          </button>

          <span className="date" role="status">
            <svg className="calendar" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
            {dateLabel}
          </span>

          <button
            className="btn"
            aria-label="Next day"
            onClick={() => setOffset(o => o + 1)}
            disabled={offset >= 0} // disable next button if at today
          >
            <svg className="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
