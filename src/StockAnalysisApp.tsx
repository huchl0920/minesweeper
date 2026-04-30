import { useState } from 'react';
import './StockAnalysisApp.css';

// --- 工具型別與函數 (保持獨立) ---
interface IAnalysisResult {
  symbol: string;
  currentPrice: number;
  entryPrice: number;
  tp: number;
  sl: number;
  strengthScore: number;
  trend: string;
  levels: { label: string, price: number }[];
}

export default function StockAnalysisApp({ onBack }: { onBack: () => void }) {
  const [symbol, setSymbol] = useState('2330');
  const [entryPrice, setEntryPrice] = useState('');
  const [result, setResult] = useState<IAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async () => {
    if (!symbol) return;
    setLoading(true);
    setError(null);

    try {
      const formatted = /^[0-9]+$/.test(symbol) ? `${symbol}.TW` : symbol;
      const res = await fetch(`/api/yahoo/v8/finance/chart/${formatted}?range=1y&interval=1d`);
      if (!res.ok) throw new Error('無法取得數據');
      
      const json = await res.json();
      const chart = json.chart?.result?.[0];
      if (!chart) throw new Error('代號錯誤');

      const close = chart.indicators.quote[0].close.filter((p: any) => p !== null);
      const high = chart.indicators.quote[0].high.filter((p: any) => p !== null);
      const low = chart.indicators.quote[0].low.filter((p: any) => p !== null);
      
      const lastPrice = close[close.length - 1];
      const entry = parseFloat(entryPrice) || lastPrice;

      // 簡單分析邏輯
      const swingHigh = Math.max(...high.slice(-60));
      const swingLow = Math.min(...low.slice(-60));
      const diff = swingHigh - swingLow;

      setResult({
        symbol,
        currentPrice: lastPrice,
        entryPrice: entry,
        tp: swingHigh,
        sl: swingHigh - diff * 0.382,
        strengthScore: 75, // 簡化示範
        trend: lastPrice > (close[close.length-20] || 0) ? 'UP' : 'SIDE',
        levels: [
          { label: '波段高點', price: swingHigh },
          { label: '支撐 0.382', price: swingHigh - diff * 0.382 },
          { label: '支撐 0.618', price: swingHigh - diff * 0.618 }
        ]
      });
    } catch (err: any) {
      setError(err.message || '分析出錯');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="stock-analysis-container">
      <div style={{ marginBottom: '20px' }}>
        <button onClick={onBack} style={{ background: 'rgba(255,255,255,0.1)', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer' }}>
          ← 返回儀表板
        </button>
      </div>

      <div className="glass-card animate-in">
        <h1 className="header-title">🩺 交易診斷器</h1>
        <p className="header-subtitle">即時分析個股壓力、支撐與強弱程度</p>

        <div className="analysis-input-row" style={{ marginTop: '20px' }}>
          <div className="input-field">
            <label style={{ fontSize: '12px', color: '#818cf8', display: 'block', marginBottom: '5px' }}>股票代號</label>
            <input 
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '12px', borderRadius: '12px', width: '100%' }}
              value={symbol} 
              onChange={e => setSymbol(e.target.value.toUpperCase())}
              placeholder="例如: 2330"
            />
          </div>
          <div className="input-field">
            <label style={{ fontSize: '12px', color: '#818cf8', display: 'block', marginBottom: '5px' }}>進場價</label>
            <input 
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '12px', borderRadius: '12px', width: '100%' }}
              type="number"
              value={entryPrice} 
              onChange={e => setEntryPrice(e.target.value)}
              placeholder="預設現價"
            />
          </div>
          <button 
            onClick={handleAnalyze} 
            disabled={loading}
            style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)', color: 'white', border: 'none', padding: '12px 24px', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer' }}
          >
            {loading ? '分析中...' : '開始診斷'}
          </button>
        </div>
      </div>

      {error && <div style={{ color: '#fca5a5', padding: '20px', textAlign: 'center' }}>{error}</div>}

      {result && (
        <div className="analysis-results animate-in" style={{ marginTop: '30px' }}>
          <div className="main-stats" style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '20px' }}>
            <div className="result-card" style={{ background: 'rgba(30,41,59,0.7)', padding: '30px', borderRadius: '24px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ color: '#94a3b8', fontSize: '14px' }}>強弱評分</div>
              <div style={{ fontSize: '64px', fontWeight: '900', color: '#10b981', margin: '10px 0' }}>{result.strengthScore}</div>
              <div style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', display: 'inline-block' }}>
                {result.trend === 'UP' ? '🔥 強勢格局' : '☁️ 震盪整理'}
              </div>
            </div>

            <div className="result-card" style={{ background: 'rgba(30,41,59,0.7)', padding: '30px', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
                <div>
                  <div style={{ color: '#94a3b8', fontSize: '14px' }}>建議停利</div>
                  <div style={{ fontSize: '32px', fontWeight: '800', color: '#10b981' }}>{result.tp.toFixed(2)}</div>
                </div>
                <div>
                  <div style={{ color: '#94a3b8', fontSize: '14px' }}>建議停損</div>
                  <div style={{ fontSize: '32px', fontWeight: '800', color: '#ef4444' }}>{result.sl.toFixed(2)}</div>
                </div>
              </div>
            </div>
          </div>

          <div style={{ marginTop: '30px', background: 'rgba(30,41,59,0.7)', padding: '30px', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.1)' }}>
            <h3 style={{ marginBottom: '20px' }}>📉 關鍵位階分析</h3>
            {result.levels.map((l, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ color: '#94a3b8' }}>{l.label}</span>
                <span style={{ fontWeight: '700' }}>{l.price.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
