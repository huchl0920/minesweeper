import { useState, useRef } from 'react';
import './StockStrategyApp.css';
import { fetchYahooHistory } from './utils/fiboLogic';
import { getStrategySignal } from './utils/strategyLogic';
import type { StrategyType } from './utils/strategyLogic';
import type { IBacktestTrade, IFiboStrategyResult } from './utils/fiboLogic';

// ── Types ──────────────────────────────────────────
interface IBacktestResult {
  symbol: string; strategyName: string; winRate: string;
  totalTrades: number; trades: IBacktestTrade[]; currentSignal: IFiboStrategyResult;
}
interface IDiagnosisResult {
  symbol: string; currentPrice: number; entryPrice: number;
  tp: number; sl: number; score: number; trend: string;
  levels: { label: string; price: number }[];
}
interface IRadarCandidate {
  symbol: string; name: string; score: number; winRate: number;
  entry: number; tp: number; sl: number; rr: number;
  reasons: string[]; currentPrice: number; dataDate: string;
}

interface Props { onBack: () => void; initialTab?: 'backtest' | 'diagnosis' | 'radar'; }

const STRATEGIES: { value: StrategyType; label: string }[] = [
  { value: 'FIBO',        label: '斐波那契強勢突破' },
  { value: 'MA_CROSS',    label: '均線黃金交叉 (5/20)' },
  { value: 'RSI_OVERSOLD',label: 'RSI 超賣反彈' },
];

// ── Helper indicators (self-contained) ─────────────
function ma(arr: number[], w: number, i: number) {
  if (i < w - 1) return 0;
  return arr.slice(i - w + 1, i + 1).reduce((a, b) => a + b, 0) / w;
}
function rsi(arr: number[], w = 14): number {
  if (arr.length < w + 1) return 50;
  let g = 0, l = 0;
  for (let i = arr.length - w; i < arr.length; i++) {
    const d = arr[i] - arr[i - 1]; if (d > 0) g += d; else l -= d;
  }
  if (l === 0) return 100;
  return 100 - 100 / (1 + g / l);
}

// ── MACD helper ────────────────────────────────────
function macd(prices: number[]) {
  const k12 = 2 / 13, k26 = 2 / 27, k9 = 2 / 10;
  let e12 = prices[0], e26 = prices[0], dea = 0;
  const difs: number[] = [];
  for (const p of prices) {
    e12 = p * k12 + e12 * (1 - k12);
    e26 = p * k26 + e26 * (1 - k26);
    difs.push(e12 - e26);
  }
  const deas: number[] = [];
  for (const d of difs) { dea = d * k9 + dea * (1 - k9); deas.push(dea); }
  const L = difs.length - 1;
  return { dif: difs[L], dea: deas[L], prevDif: difs[L - 1], prevDea: deas[L - 1] };
}

// ── Multi-factor scoring ────────────────────────────
async function analyzeStock(sym: string, name: string): Promise<IRadarCandidate | null> {
  try {
    // 使用原本穩定運作的 fetchYahooHistory (with upgraded proxy headers)
    const hist = await fetchYahooHistory(sym, '1y');
    if (hist.length < 80) return null;

    const closes  = hist.map(d => d.close);
    const volumes = hist.map(d => d.volume);
    const L = closes.length - 1;

    // ── 前置過濾 (不計分，直接淘汰) ──────────────────
    // 1. 最低流動性：近 5 日均量 > 500 張 (50萬股)
    const avgVol5 = volumes.slice(-6, -1).reduce((a, b) => a + b, 0) / 5;
    if (avgVol5 < 500000) return null;

    // 2. 最低價格：現價 > 5 元 (避免雞蛋水餃股)
    if (closes[L] < 5) return null;

    const reasons: string[] = [];
    let score = 0;

    // ── 因子評分 ──────────────────────────────────────
    // 因子 A: 均線多頭排列 5>20>60 (25分)
    const ma5  = ma(closes, 5,  L);
    const ma20 = ma(closes, 20, L);
    const ma60 = ma(closes, 60, L);
    if (ma5 > ma20 && ma20 > ma60) { score += 25; reasons.push('均線多頭排列'); }
    else return null; // 均線排列不符直接淘汰

    // 因子 B: RSI 健康帶 50-72 (15分)
    const currRsi = rsi(closes);
    if (currRsi >= 50 && currRsi <= 72) { score += 15; reasons.push(`RSI ${currRsi.toFixed(0)}`); }

    // 因子 C: 斐波那契突破 0.236 (20分)
    const recent60 = hist.slice(-60);
    const swHigh = Math.max(...recent60.map(d => d.high));
    const swLow  = Math.min(...recent60.map(d => d.low));
    const diff   = swHigh - swLow;
    const bp236  = swHigh - diff * 0.236;
    if (closes[L - 1] <= bp236 && closes[L] > bp236) { score += 20; reasons.push('突破 Fibo 0.236'); }

    // 因子 D: MACD 金叉 (15分) ← 新增
    const { dif, dea, prevDif, prevDea } = macd(closes);
    if (prevDif <= prevDea && dif > dea) { score += 15; reasons.push('MACD 金叉'); }
    else if (dif > dea && dif > 0)       { score += 8;  reasons.push('MACD 水上'); }

    // 因子 E: 量縮整理後爆量突破 (20分) ← 新增
    const vol3DayAvg = volumes.slice(-4, -1).reduce((a, b) => a + b, 0) / 3;
    const isConsolidation = vol3DayAvg < avgVol5 * 0.85; // 前3天量縮
    const isBurstDay = volumes[L] > avgVol5 * 1.8;       // 今天爆量
    if (isConsolidation && isBurstDay) { score += 20; reasons.push('量縮後爆量'); }
    else if (volumes[L] > avgVol5 * 1.5) { score += 10; reasons.push('爆量啟動'); }

    // 因子 F: 低乖離率 (現價距 MA20 < 8%) (10分) ← 新增
    const deviation = Math.abs((closes[L] - ma20) / ma20) * 100;
    if (deviation < 8) { score += 10; reasons.push(`乖離 ${deviation.toFixed(1)}%`); }
    else if (deviation >= 10) return null; // 追高超過 10% 直接淘汰

    // 因子 G: 20日趨勢向上 (5分)
    if (closes[L] > closes[L - 20]) { score += 5; reasons.push('20日上升趨勢'); }

    // ── 嚴格入選門檻 (從55分升至70分) ───────────────
    if (score < 70) return null;

    // ── 計算 TP / SL ──────────────────────────────────
    const entry  = closes[L];
    const tp     = swHigh;
    const sl     = swHigh - diff * 0.382;
    const safesl = sl >= entry ? entry * 0.95 : sl;
    const rr = Math.abs(tp - entry) / Math.max(0.01, Math.abs(entry - safesl));
    if (rr < 1.5) return null; // 盈虧比門檻從1.2升至1.5

    // ── 1年歷史勝率回測 ───────────────────────────────
    let wins = 0, total = 0;
    // 用簡化版勝率：對最近 60 個交易日，若每次觸發突破後 10 天內碰 TP 為勝
    for (let i = 60; i < hist.length - 1; i++) {
      const slice = hist.slice(0, i + 1);
      const sliceHigh = Math.max(...slice.slice(-60).map(d => d.high));
      const sliceLow  = Math.min(...slice.slice(-60).map(d => d.low));
      const sliceDiff = sliceHigh - sliceLow;
      const sliceBP   = sliceHigh - sliceDiff * 0.236;
      if (slice[slice.length - 2]?.close <= sliceBP && slice[slice.length - 1]?.close > sliceBP) {
        total++;
        const sigTP = sliceHigh;
        const sigSL = sliceHigh - sliceDiff * 0.382;
        for (let j = i + 1; j < Math.min(i + 15, hist.length); j++) {
          if (hist[j].high >= sigTP)  { wins++; break; }
          if (hist[j].low  <= sigSL)  { break; }
        }
      }
    }
    const winRate = total > 3 ? (wins / total) * 100 : 0;
    if (winRate < 50) return null;

    const dataDate = hist[L].date;
    return { symbol: sym, name, score, winRate, entry, tp, sl: safesl, rr, reasons, currentPrice: closes[L], dataDate };
  } catch { return null; }
}

// ══════════════════════════════════════════════════
export default function StockStrategyApp({ onBack, initialTab = 'backtest' }: Props) {
  const [activeTab, setActiveTab] = useState<'backtest' | 'diagnosis' | 'radar'>(initialTab);
  const [symbol,    setSymbol]    = useState('2330');
  const [strategyType, setStrategyType] = useState<StrategyType>('FIBO');
  const [entryPrice,   setEntryPrice]   = useState('');
  const [backtest,  setBacktest]  = useState<IBacktestResult | null>(null);
  const [diagnosis, setDiagnosis] = useState<IDiagnosisResult | null>(null);
  const [candidates, setCandidates] = useState<IRadarCandidate[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [progress,  setProgress]  = useState({ cur: 0, total: 0, text: '' });
  const [error,     setError]     = useState<string | null>(null);
  const cancelRef = useRef(false);

  // ── Tab style helper ──
  const tabStyle = (t: string) => ({
    flex: 1, padding: '10px', borderRadius: '8px', border: 'none', cursor: 'pointer',
    background: activeTab === t ? '#6366f1' : 'transparent',
    color: 'white', fontWeight: 'bold' as const, transition: '0.3s',
  });

  // ── Backtest ──────────────────────────────────────
  const handleRunBacktest = async () => {
    if (!symbol) return;
    setLoading(true); setError(null);
    try {
      const history = await fetchYahooHistory(symbol, '1y');
      if (history.length < 60) throw new Error(`數據不足 (${history.length} 天)`);
      const trades: IBacktestTrade[] = [];
      let activeTrade: any = null;
      for (let i = 60; i < history.length; i++) {
        const d = history[i];
        if (activeTrade) {
          if (d.high >= activeTrade.tp) {
            trades.push({ ...activeTrade, exitDate: d.date, exitPrice: activeTrade.tp, isWin: true, profitPercent: ((activeTrade.tp - activeTrade.entryPrice) / activeTrade.entryPrice) * 100, rrRatio: 1 });
            activeTrade = null;
          } else if (d.low <= activeTrade.sl) {
            trades.push({ ...activeTrade, exitDate: d.date, exitPrice: activeTrade.sl, isWin: false, profitPercent: ((activeTrade.sl - activeTrade.entryPrice) / activeTrade.entryPrice) * 100, rrRatio: 1 });
            activeTrade = null;
          }
        } else {
          const sig = getStrategySignal(strategyType, history, i);
          if (sig.hasSignal && sig.entry && sig.tp && sig.sl)
            activeTrade = { entryDate: d.date, entryPrice: sig.entry, tp: sig.tp, sl: sig.sl };
        }
      }
      const wr = trades.length > 0 ? (trades.filter(t => t.isWin).length / trades.length) * 100 : 0;
      const lsig = getStrategySignal(strategyType, history);
      let levels: any;
      if (strategyType === 'FIBO') {
        const r = history.slice(-60), hi = Math.max(...r.map(d => d.high)), lo = Math.min(...r.map(d => d.low)), df = hi - lo;
        levels = { '0.236': hi - df * 0.236, '0.382': hi - df * 0.382 };
      }
      setBacktest({ symbol, strategyName: STRATEGIES.find(s => s.value === strategyType)?.label || '', winRate: `${wr.toFixed(2)}%`, totalTrades: trades.length, trades: trades.reverse(), currentSignal: { symbol, hasSignal: lsig.hasSignal, state: activeTrade ? 'HOLDING' : 'WAITING_ENTRY', activeTrade: activeTrade || undefined, meta: lsig.meta, levels } });
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };

  // ── Diagnosis ─────────────────────────────────────
  const handleRunDiagnosis = async () => {
    if (!symbol) return;
    setLoading(true); setError(null);
    try {
      const history = await fetchYahooHistory(symbol, '1y');
      if (history.length < 60) throw new Error('數據不足');
      const latest = history[history.length - 1];
      const entry  = parseFloat(entryPrice) || latest.close;
      const recent = history.slice(-60);
      const high   = Math.max(...recent.map(d => d.high));
      const low    = Math.min(...recent.map(d => d.low));
      const diff   = high - low;
      const l236   = high - diff * 0.236;
      const l382   = high - diff * 0.382;
      const l618   = high - diff * 0.618;
      let tp = high, sl = l382;
      if (entry >= high) { tp = entry * 1.05; sl = high; }
      else if (entry >= l236) { tp = high; sl = l382; }
      else if (entry >= l382) { tp = l236; sl = l618; }
      else { tp = l382; sl = low; }
      if (sl >= entry) sl = entry * 0.95;
      if (tp <= entry) tp = entry * 1.05;
      setDiagnosis({ symbol, currentPrice: latest.close, entryPrice: entry, tp, sl,
        score: latest.close > history[history.length - 20].close ? 80 : 45,
        trend: latest.close > history[history.length - 20].close ? 'UP' : 'SIDE',
        levels: [{ label: '壓力 High', price: high }, { label: '0.236', price: l236 }, { label: '0.382', price: l382 }, { label: '0.618', price: l618 }, { label: '起漲 Low', price: low }] });
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };

  // ── Radar ─────────────────────────────────────────
  const handleRunRadar = async () => {
    cancelRef.current = false;
    setLoading(true); setError(null); setCandidates([]);
    try {
      // ── Step 0: 大盤氣候過濾 ─────────────────────────
      setProgress({ cur: 0, total: 0, text: '🌡️ 檢查大盤氣候...' });
      try {
        const mktHist = await fetchYahooHistory('^TWII', '3mo');
        if (mktHist.length >= 20) {
          const mktCloses = mktHist.map(d => d.close);
          const mktL = mktCloses.length - 1;
          const mktMA20 = ma(mktCloses, 20, mktL);
          const mktPrice = mktCloses[mktL];
          if (mktPrice < mktMA20 * 0.97) {
            setError(`⚠️ 大盤目前處於空頭格局（加權 ${mktPrice.toFixed(0)} < MA20 ${mktMA20.toFixed(0)}），此時個股進場風險極高。已停止掃描。`);
            setLoading(false);
            return;
          }
          const climate = mktPrice >= mktMA20 ? '多頭格局 ✅' : '弱勢整理 ⚠️';
          setProgress({ cur: 0, total: 0, text: `大盤: ${climate}，開始掃描個股...` });
        }
      } catch { /* 大盤取得失敗不阻止掃描 */ }

      // ── Step 1: 從多個來源取得完整台股清單 ──────────────
      setProgress({ cur: 0, total: 0, text: '📋 正在取得台股清單 (上市 + 上櫃)...' });

      const stockMap: Record<string, { code: string; name: string; sym: string }> = {};

      // 來源 A: TWSE OpenAPI - 上市股 (~900檔)
      try {
        const twseRes = await fetch('/api/twse_open/v1/exchangeReport/STOCK_DAY_ALL');
        if (twseRes.ok) {
          const twseData = await twseRes.json();
          (Array.isArray(twseData) ? twseData : []).forEach((s: any) => {
            const code = s.Code || s.stock_id || s[0];
            const name = s.Name || s.stock_name || s[1] || code;
            if (typeof code === 'string' && /^[0-9]{4}$/.test(code)) {
              stockMap[code] = { code, name, sym: code + '.TW' };
            }
          });
        }
      } catch { /* continue */ }

      // 來源 B: TPEX OpenAPI - 上櫃股 (~800檔)
      try {
        const tpexRes = await fetch('/api/tpex/openapi/v1/tpex_mainboard_quotes');
        if (tpexRes.ok) {
          const tpexData = await tpexRes.json();
          // TPEX 回應可能是 array of objects 或 array of arrays
          (Array.isArray(tpexData) ? tpexData : []).forEach((s: any) => {
            const code = s.SecuritiesCompanyCode || s.Code || s.stockCode || s[0];
            const name = s.CompanyName || s.Name || s.stockName || s[1] || code;
            if (typeof code === 'string' && /^[0-9]{4}$/.test(code) && !stockMap[code]) {
              stockMap[code] = { code, name, sym: code + '.TWO' };
            }
          });
        }
      } catch { /* continue */ }

      // 來源 C: TWSE 個股報價 (for OTC via different TPEX endpoint)
      if (Object.keys(stockMap).length < 1200) {
        try {
          const otcRes = await fetch('/api/tpex/openapi/v1/tpex_otc_quotes');
          if (otcRes.ok) {
            const otcData = await otcRes.json();
            (Array.isArray(otcData) ? otcData : []).forEach((s: any) => {
              const code = s.SecuritiesCompanyCode || s.Code || s[0];
              const name = s.CompanyName || s.Name || s[1] || code;
              if (typeof code === 'string' && /^[0-9]{4}$/.test(code) && !stockMap[code]) {
                stockMap[code] = { code, name, sym: code + '.TWO' };
              }
            });
          }
        } catch { /* continue */ }
      }

      // 來源 D: FinMind 補漏（若前面來源不足 1200 檔）
      if (Object.keys(stockMap).length < 1200) {
        try {
          const fmRes = await fetch('/api/finmind/api/v4/data?dataset=TaiwanStockInfo');
          if (fmRes.ok) {
            const fmJson = await fmRes.json();
            (fmJson.data || []).forEach((r: any) => {
              const code = r.stock_id;
              if (/^[0-9]{4}$/.test(code) && !stockMap[code]) {
                const isTW = r.type === 'tse' || r.type === 'twse';
                stockMap[code] = { code, name: r.stock_name || code, sym: code + (isTW ? '.TW' : '.TWO') };
              }
            });
          }
        } catch { /* FinMind 可能 403，沒關係 */ }
      }

      const uniqueList = Object.values(stockMap);
      if (uniqueList.length === 0) throw new Error('無法取得股票清單，請稍後再試。');

      setProgress({ cur: 0, total: uniqueList.length, text: `✅ 取得 ${uniqueList.length} 檔股票 (上市+上櫃)，開始逐一分析...` });
      await new Promise(r => setTimeout(r, 800));

      const results: IRadarCandidate[] = [];
      const batchSize = 8;
      let failCount = 0;
      for (let i = 0; i < uniqueList.length; i += batchSize) {
        if (cancelRef.current) break;
        const batch = uniqueList.slice(i, i + batchSize);
        setProgress({ cur: i, total: uniqueList.length, text: `分析 ${i}/${uniqueList.length}　已找到 ${results.length} 檔候選　失敗 ${failCount} 檔` });
        const batchResults = await Promise.all(batch.map(s => analyzeStock(s.sym, s.name).catch(() => { failCount++; return null; })));
        batchResults.forEach(r => { if (r) results.push(r); });
      }
      results.sort((a, b) => b.score * b.winRate - a.score * a.winRate);
      setCandidates(results.slice(0, 20));
      if (results.length === 0) {
        setError(`掃描完成，共分析 ${Math.min(uniqueList.length, uniqueList.length)} 檔，API 失敗 ${failCount} 檔。目前無股票符合嚴格條件（評分≥70、勝率≥50%、盈虧比≥1.5）。可能為非交易時段或今日行情偏弱。`);
      }
    } catch (e: any) { setError(e.message); } finally { setLoading(false); setProgress({ cur: 0, total: 0, text: '' }); }
  };

  const handleCancelRadar = () => { cancelRef.current = true; setLoading(false); };

  // ── Render ────────────────────────────────────────
  return (
    <div className="stock-strategy-container">
      <button className="back-btn" onClick={onBack}><span>←</span> 返回首頁</button>

      <div className="glass-card animate-in">
        {/* Tab switcher */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', background: 'rgba(0,0,0,0.25)', padding: '5px', borderRadius: '12px' }}>
          <button style={tabStyle('backtest')} onClick={() => setActiveTab('backtest')}>📊 策略回測</button>
          <button style={tabStyle('diagnosis')} onClick={() => setActiveTab('diagnosis')}>🩺 交易診斷</button>
          <button style={tabStyle('radar')} onClick={() => setActiveTab('radar')}>🎯 智能雷達</button>
        </div>

        {/* Backtest input */}
        {activeTab === 'backtest' && (
          <div className="input-group">
            <div className="input-field-wrapper" style={{ flex: 1.5 }}>
              <span className="input-label">策略選擇</span>
              <select value={strategyType} onChange={e => setStrategyType(e.target.value as any)} className="strategy-select">
                {STRATEGIES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div className="input-field-wrapper">
              <span className="input-label">代號</span>
              <input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} placeholder="2330" onKeyDown={e => e.key === 'Enter' && handleRunBacktest()} />
            </div>
            <button className="action-btn" onClick={handleRunBacktest} disabled={loading}>{loading ? '...' : '開始回測'}</button>
          </div>
        )}

        {/* Diagnosis input */}
        {activeTab === 'diagnosis' && (
          <div className="input-group">
            <div className="input-field-wrapper">
              <span className="input-label">股票代號</span>
              <input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} placeholder="2330" onKeyDown={e => e.key === 'Enter' && handleRunDiagnosis()} />
            </div>
            <div className="input-field-wrapper">
              <span className="input-label">進場價格</span>
              <input type="number" value={entryPrice} onChange={e => setEntryPrice(e.target.value)} placeholder="預設現價" onKeyDown={e => e.key === 'Enter' && handleRunDiagnosis()} />
            </div>
            <button className="action-btn" onClick={handleRunDiagnosis} disabled={loading} style={{ background: '#10b981' }}>{loading ? '...' : '分析診斷'}</button>
          </div>
        )}

        {/* Radar input */}
        {activeTab === 'radar' && (
          <div style={{ padding: '1rem 0' }}>
            <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '1rem' }}>
              🔍 掃描<b style={{ color: '#f8fafc' }}>台股全市場（上市 + 上櫃，約 1,700 檔）</b>，經過 <b style={{ color: '#818cf8' }}>7 項技術因子</b> 嚴格篩選，找出當前最具潛力的強勢標的，附 1 年歷史勝率驗證。分析約需 <b style={{ color: '#f59e0b' }}>15-30 分鐘</b>，可隨時按停止查看當前結果。
            </p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '1rem' }}>
              {[
                '🌡️ 大盤氣候過濾', '✅ 均線多頭排列', '✅ 斐波那契突破',
                '✅ MACD 金叉確認', '✅ 量縮後爆量', '✅ RSI 50-72', '✅ 乖離率 < 8%'
              ].map(f => (
                <span key={f} style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', padding: '4px 12px', borderRadius: '20px', fontSize: '0.78rem', color: '#a5b4fc' }}>{f}</span>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button className="action-btn" onClick={handleRunRadar} disabled={loading} style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', padding: '12px 28px', fontSize: '1rem' }}>
                {loading ? `分析中 (${progress.cur}/${progress.total})` : '🚀 啟動智能雷達'}
              </button>
              {loading && (
                <button onClick={handleCancelRadar} style={{ background: 'rgba(239,68,68,0.2)', border: '1px solid #ef4444', color: '#f87171', padding: '12px 20px', borderRadius: '12px', cursor: 'pointer' }}>
                  停止
                </button>
              )}
            </div>
            {loading && progress.text && (
              <div style={{ marginTop: '12px', fontSize: '0.8rem', color: '#64748b' }}>
                <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '8px', height: '6px', marginBottom: '6px' }}>
                  <div style={{ background: '#6366f1', height: '100%', borderRadius: '8px', width: `${(progress.cur / Math.max(progress.total, 1)) * 100}%`, transition: 'width 0.5s' }} />
                </div>
                {progress.text}
              </div>
            )}
          </div>
        )}
      </div>

      {error && <div className="error-card">⚠️ {error}</div>}

      {/* ── Backtest results ── */}
      {activeTab === 'backtest' && backtest && (
        <div className="animate-in">
          <div className="stat-grid">
            <div className="stat-box"><div className="stat-label">勝率</div><div className="stat-value" style={{ color: '#10b981' }}>{backtest.winRate}</div></div>
            <div className="stat-box"><div className="stat-label">總次數</div><div className="stat-value">{backtest.totalTrades}</div></div>
            <div className="stat-box"><div className="stat-label">策略</div><div className="stat-value" style={{ fontSize: '1rem', paddingTop: '0.5rem' }}>{backtest.strategyName}</div></div>
          </div>
          <div className="log-table-wrapper">
            <table className="log-table">
              <thead><tr><th>結果</th><th>進場日</th><th>進場價</th><th>出場日</th><th>出場價</th><th>盈虧</th></tr></thead>
              <tbody>
                {backtest.trades.map((t, i) => (
                  <tr key={i}>
                    <td><span className={`trade-badge ${t.isWin ? 'win' : 'loss'}`}>{t.isWin ? 'WIN' : 'LOSS'}</span></td>
                    <td className="date-text">{t.entryDate}</td>
                    <td>{t.entryPrice?.toFixed(2)}</td>
                    <td className="date-text">{t.exitDate}</td>
                    <td>{t.exitPrice?.toFixed(2)}</td>
                    <td className={t.profitPercent >= 0 ? 'price-up' : 'price-down'}>{t.profitPercent?.toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Diagnosis results ── */}
      {activeTab === 'diagnosis' && diagnosis && (
        <div className="animate-in">
          <div className="stat-grid">
            <div className="stat-box"><div className="stat-label">強弱評分</div><div className="stat-value" style={{ color: diagnosis.score > 60 ? '#10b981' : '#f59e0b' }}>{diagnosis.score}</div></div>
            <div className="stat-box"><div className="stat-label">建議停利</div><div className="stat-value" style={{ color: '#10b981' }}>{diagnosis.tp.toFixed(2)}</div></div>
            <div className="stat-box"><div className="stat-label">建議停損</div><div className="stat-value" style={{ color: '#ef4444' }}>{diagnosis.sl.toFixed(2)}</div></div>
          </div>
          <div className="glass-card">
            <h3 style={{ marginBottom: '16px' }}>📉 關鍵技術位階</h3>
            {diagnosis.levels.map((l, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                <span style={{ color: '#94a3b8' }}>{l.label}</span><b>{l.price.toFixed(2)}</b>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Radar results ── */}
      {activeTab === 'radar' && candidates.length > 0 && (
        <div className="animate-in">
          <h2 className="section-title" style={{ marginBottom: '1.5rem' }}>
            🏆 篩選結果：{candidates.length} 檔強勢候選股
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {candidates.map((c, i) => (
              <div key={c.symbol} style={{
                background: 'rgba(30,41,59,0.7)', border: `1px solid ${c.score >= 80 ? 'rgba(16,185,129,0.4)' : 'rgba(99,102,241,0.3)'}`,
                borderRadius: '20px', padding: '1.5rem 2rem',
                borderLeft: `4px solid ${c.score >= 80 ? '#10b981' : '#6366f1'}`
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '1.4rem', fontWeight: 900, color: '#f8fafc' }}>#{i + 1} {c.symbol}</span>
                      <span style={{ fontSize: '0.9rem', color: '#94a3b8' }}>{c.name}</span>
                      <span style={{ background: 'rgba(99,102,241,0.2)', color: '#818cf8', padding: '2px 10px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 700 }}>
                        評分 {c.score}
                      </span>
                      <span style={{ background: 'rgba(255,255,255,0.05)', color: '#64748b', padding: '2px 10px', borderRadius: '20px', fontSize: '0.72rem' }}>
                        📅 資料日期：{c.dataDate}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {c.reasons.map(r => (
                        <span key={r} style={{ background: 'rgba(16,185,129,0.1)', color: '#34d399', border: '1px solid rgba(16,185,129,0.2)', padding: '2px 8px', borderRadius: '12px', fontSize: '0.72rem' }}>{r}</span>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, auto)', gap: '20px', textAlign: 'center' }}>
                    <div><div style={{ fontSize: '0.72rem', color: '#64748b' }}>現價</div><div style={{ fontSize: '1.2rem', fontWeight: 800 }}>{c.currentPrice.toFixed(2)}</div></div>
                    <div><div style={{ fontSize: '0.72rem', color: '#64748b' }}>停利</div><div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#10b981' }}>{c.tp.toFixed(2)}</div></div>
                    <div><div style={{ fontSize: '0.72rem', color: '#64748b' }}>停損</div><div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#ef4444' }}>{c.sl.toFixed(2)}</div></div>
                    <div>
                      <div style={{ fontSize: '0.72rem', color: '#64748b' }}>勝率</div>
                      <div style={{ fontSize: '1.2rem', fontWeight: 800, color: c.winRate >= 55 ? '#10b981' : '#f59e0b' }}>{c.winRate.toFixed(0)}%</div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
