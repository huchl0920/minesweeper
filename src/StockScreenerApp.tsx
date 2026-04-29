import { useState, useEffect, useMemo, useCallback } from 'react';

interface StockData {
  symbol: string;
  name: string;
  prices: number[];
  volumes: number[];
  historyCount: number;
}

interface IndicatorData {
  symbol: string;
  name: string;
  close: number;
  prevClose: number;
  volume: number;
  prevVolume: number;
  ma5: number;
  ma10: number;
  ma20: number;
  prevMa5: number;
  rsi: number;
  macdDIF: number;
  macdDEA: number;
  macdHist: number;
  prevMacdHist: number;
  vAvg5: number;
  high20: number;
  changePercent: number;
  isBullishAlignment: boolean;
  date: string;
  historyCount: number;
}

interface FilterTag {
  id: string;
  label: string;
  fn: (item: IndicatorData) => boolean;
}

const FILTERS: FilterTag[] = [
  { id: 'break5ma', label: '突破5MA第一天', fn: (d) => d.close > d.ma5 && d.prevClose <= d.prevMa5 },
  { id: 'volUp', label: '成交量大於前日', fn: (d) => d.volume > d.prevVolume },
  { id: 'bullish', label: '均線多頭排列', fn: (d) => d.ma5 > d.ma10 && d.ma10 > d.ma20 },
  { id: 'goldCross5_10', label: '5MA穿過10MA', fn: (d) => d.ma5 > d.ma10 && d.prevMa5 <= d.ma10 },
  { id: 'macdGold', label: 'MACD金叉', fn: (d) => d.macdHist > 0 && d.prevMacdHist <= 0 },
  { id: 'macdUp', label: 'MACD水上金叉', fn: (d) => d.macdHist > 0 && d.prevMacdHist <= 0 && d.macdDIF > 0 },
  { id: 'macdDown', label: 'MACD水下金叉', fn: (d) => d.macdHist > 0 && d.prevMacdHist <= 0 && d.macdDIF < 0 },
  { id: 'volBurst', label: '量增啟動(2倍)', fn: (d) => d.volume > d.vAvg5 * 2 && d.vAvg5 > 0 },
  { id: 'highBreak', label: '強勢創20日高', fn: (d) => d.close >= d.high20 && d.close > 0 },
  { id: 'strongPrice', label: '帶量漲幅 > 3%', fn: (d) => d.changePercent > 3 && d.volume > d.prevVolume },
  { id: 'rsiLow', label: 'RSI < 20', fn: (d) => d.rsi < 20 && d.rsi > 0 },
  { id: 'rsiHigh', label: 'RSI > 80', fn: (d) => d.rsi > 80 }
];

export default function StockScreenerApp({ onBack }: { onBack: () => void }) {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [snapshotCount, setSnapshotCount] = useState(0);
  const [backtestDate, setBacktestDate] = useState(''); // YYYY-MM-DD
  const [stagedDate, setStagedDate] = useState(''); // 暫存日期，按下確認後才執行
  
  // 持久化原始歷史數據，避免重複抓取
  const [rawStocks, setRawStocks] = useState<{ [symbol: string]: { name: string, prices: number[], volumes: number[], timestamps: number[] } }>({});
  
  const calculateIndicators = useCallback((stock: StockData): IndicatorData | null => {
    const { prices, volumes } = stock;
    const L = prices.length - 1;
    if (L < 0) return null;

    // 建立基礎物件 (即使沒歷史數據也能顯示基本面)
    const base: IndicatorData = {
       symbol: stock.symbol,
       name: stock.name,
       close: prices[L],
       prevClose: prices[L-1] || prices[L],
       volume: volumes[L],
       prevVolume: volumes[L-1] || 0,
       ma5: 0, ma10: 0, ma20: 0, prevMa5: 0,
       rsi: 0, macdDIF: 0, macdDEA: 0, macdHist: 0, prevMacdHist: 0,
       vAvg5: volumes[L],
       high20: Math.max(...prices),
       changePercent: prices[L-1] > 0 ? ((prices[L] - prices[L-1]) / prices[L-1]) * 100 : 0,
       isBullishAlignment: false,
       date: '',
       historyCount: prices.length
    };

    if (prices.length < 26) return base;

    const getMA = (arr: number[], period: number, endIdx: number) => {
       if (endIdx < period - 1) return 0;
       return arr.slice(endIdx - period + 1, endIdx + 1).reduce((a, b: number) => a + b, 0) / period;
    };

    const getRSI = (arr: number[], period: number = 14) => {
       if (arr.length < period + 1) return 0;
       let gains = 0, losses = 0;
       for (let i = arr.length - period; i < arr.length; i++) {
          const diff = arr[i] - arr[i-1];
          if (diff > 0) gains += diff;
          else losses -= diff;
       }
       if (losses === 0) return 100;
       const rs = gains / losses;
       return 100 - (100 / (1 + rs));
    };

    const getMACD = (arr: number[]) => {
       const ema12Arr: number[] = [], ema26Arr: number[] = [];
       const k12 = 2/13, k26 = 2/27;
       let e12 = arr[0], e26 = arr[0];
       for(const val of arr) {
          e12 = val * k12 + e12 * (1 - k12);
          e26 = val * k26 + e26 * (1 - k26);
          ema12Arr.push(e12); ema26Arr.push(e26);
       }
       const difArr = ema12Arr.map((v, i) => v - ema26Arr[i]);
       const k9 = 2/10;
       let dea = difArr[0];
       const deaArr: number[] = [];
       for(const v of difArr) {
          dea = v * k9 + dea * (1 - k9);
          deaArr.push(dea);
       }
       const histArr = difArr.map((v, i) => (v - deaArr[i]) * 2);
       return { 
         dif: difArr[difArr.length - 1], 
         dea: deaArr[deaArr.length - 1], 
         hist: histArr[histArr.length - 1], 
         prevHist: histArr[histArr.length - 2] || 0 
       };
    };

    const curMACD = getMACD(prices);
    
    return {
       symbol: stock.symbol,
       name: stock.name,
       close: prices[L],
       prevClose: prices[L-1],
       volume: volumes[L],
       prevVolume: volumes[L-1],
       ma5: getMA(prices, 5, L),
       ma10: getMA(prices, 10, L),
       ma20: getMA(prices, 20, L),
       prevMa5: getMA(prices, 5, L-1),
       rsi: getRSI(prices),
       macdDIF: curMACD.dif,
       macdDEA: curMACD.dea,
       macdHist: curMACD.hist,
       prevMacdHist: curMACD.prevHist,
       vAvg5: getMA(volumes, 5, L),
       high20: Math.max(...prices.slice(Math.max(0, L - 19), L + 1)),
       changePercent: prices[L-1] > 0 ? ((prices[L] - prices[L-1]) / prices[L-1]) * 100 : 0,
       isBullishAlignment: false,
       date: '',
       historyCount: prices.length
    };
  }, []);

  const loadData = useCallback(async (isCancelled: () => boolean) => {
    await Promise.resolve();
    if (isCancelled()) return;
    
    setLoading(true);
    setProgress(0);
    setStatusText('正在獲取市場清單...');
    try {
      const resList = await fetch('/api/finmind/api/v4/data?dataset=TaiwanStockInfo');
      if (isCancelled()) return;
      const jsonList = await resList.json();
      const rawData = (jsonList.data || []).map((r: { stock_id: string; stock_name: string; type: string }) => ({
        code: r.stock_id,
        name: r.stock_name,
        type: r.type,
        sym: r.stock_id + (r.type === 'tse' || r.type === 'twse' ? '.TW' : '.TWO')
      })).filter((s: { code: string }) => /^[0-9]{4}$/.test(s.code));
      
      const seen = new Set<string>();
      const fullList = rawData.filter((s: { sym: string }) => {
        if (seen.has(s.sym)) return false;
        seen.add(s.sym);
        return true;
      });
      
      const total = fullList.length;
      console.log(`[Screener] Found ${total} symbols`);
      
      // --- 恢復必要的輔助函數與快照地圖 ---
      const twseMasterMap: Record<string, { close: number; vol: number; volHistory: number[] }> = {};
      (window as any).twseMasterMap = twseMasterMap; 
      
      const cleanN = (s: any) => {
        if (typeof s === 'number') return isNaN(s) ? 0 : s;
        const cleaned = String(s || '0').replace(/[^0-9.-]/g, '');
        const n = parseFloat(cleaned);
        return isNaN(n) ? 0 : n;
      };

      const saveToMap = (code: string, close: number, vol: number) => {
        const c = (code || '').trim();
        if (!c || isNaN(close) || isNaN(vol)) return;
        twseMasterMap[c] = { close, vol, volHistory: [vol] };
      };

      try {
        setStatusText(`正在同步全台股快照 (MI_INDEX)...`);
        const [tseRes, otcRes] = await Promise.all([
          fetch(`/api/twse_www/exchangeReport/MI_INDEX?response=json&type=ALLBUT0999`),
          fetch(`/api/tpex/openapi/v1/tpex_mainboard_quotes`)
        ]);

        if (tseRes.ok) {
          const tseData = await tseRes.json();
          const table = (tseData.tables || []).find((t: any) => t.title?.includes('每日收盤行情')) || 
                        (tseData.data9 ? { fields: tseData.fields9, data: tseData.data9 } : null);
          if (table && table.data) {
            const f = table.fields || [];
            const cIdx = Math.max(0, f.findIndex((n: string) => n.includes('代號')));
            const vIdx = Math.max(2, f.findIndex((n: string) => n.includes('成交股數')));
            const pIdx = Math.max(8, f.findIndex((n: string) => n.includes('收盤價')));
            table.data.forEach((row: any[]) => {
              if (Array.isArray(row)) saveToMap(row[cIdx], cleanN(row[pIdx]), cleanN(row[vIdx]));
            });
          }
        }
        if (otcRes.ok) {
          const otcData = await otcRes.json();
          const items = Array.isArray(otcData) ? otcData : (otcData.data || []);
          items.forEach((s: any) => {
            if (Array.isArray(s)) saveToMap(s[0], cleanN(s[2]), cleanN(s[7]));
            else saveToMap(s.Code || s.stock_id, cleanN(s.Close || s.ClosingPrice), cleanN(s.TradeVolume || s.TradingShares));
          });
        }
        setSnapshotCount(Object.keys(twseMasterMap).length);
      } catch (e) { console.warn('Snapshot error', e); }

      const batchSize = 10;
      const newRawStocksTemp: typeof rawStocks = {};
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 90); // 抓 90 天確保指標充足
      const startDate = thirtyDaysAgo.toISOString().split('T')[0];
      
      for (let i = 0; i < fullList.length; i += batchSize) {
        if (isCancelled()) return;
        const batch = fullList.slice(i, i + batchSize);
        
        await Promise.all(batch.map(async (stock: any) => {
          try {
            // 優先嘗試 Yahoo (3個月)
            let hRes = await fetch(`/api/yahoo/v8/finance/chart/${stock.sym}?range=3mo&interval=1d`);
            let hData: any = null;
            
            if (hRes.ok) {
              hData = await hRes.json();
            } else {
              // Yahoo 失敗，秒切 FinMind 備援
              const fRes = await fetch(`/api/finmind/api/v4/data?dataset=TaiwanStockPrice&stock_id=${stock.code}&start_date=${startDate}`);
              if (fRes.ok) {
                const fJson = await fRes.ok ? await fRes.json() : null;
                if (fJson && fJson.data) {
                  hData = { 
                    chart: { result: [{
                      timestamp: fJson.data.map((d: any) => Math.floor(new Date(d.date).getTime()/1000)),
                      indicators: { quote: [{
                        close: fJson.data.map((d: any) => d.close),
                        volume: fJson.data.map((d: any) => d.Trading_Volume)
                      }]}
                    }]}
                  };
                }
              }
            }

            if (hData) {
              const res = hData.chart?.result?.[0];
              const indicators = res?.indicators?.quote?.[0];
              if (indicators && indicators.close) {
                let prices = (indicators.close as any[]).filter(p => p !== null);
                let volumes = (indicators.volume as any[]).filter(v => v !== null);
                let timestamps = res.timestamp || [];
                
                const existingSnapshot = twseMasterMap[stock.code];
                if (existingSnapshot && prices.length > 0) {
                   prices.push(existingSnapshot.close);
                   volumes.push(existingSnapshot.vol);
                   timestamps.push(Math.floor(Date.now()/1000));
                }
                
                // 確保時間軸是從小到大排序 (指標計算必備)
                const combined = (timestamps as number[]).map((t: number, idx: number) => ({ t, p: prices[idx], v: volumes[idx] }))
                  .filter((item: any) => item.p !== undefined)
                  .sort((a: any, b: any) => a.t - b.t);

                newRawStocksTemp[stock.sym] = {
                  name: stock.name,
                  prices: combined.map((c: any) => c.p),
                  volumes: combined.map((c: any) => c.v),
                  timestamps: combined.map((c: any) => c.t)
                };
              }
            }
          } catch { /* ignore individual */ }
        }));

        setProgress(Math.min(99, Math.round(((i + batchSize) / total) * 100)));
        setStatusText(`正在統整大數據指標... (${Object.keys(newRawStocksTemp).length} / ${total})`);
        // 適度延遲避免被封鎖
        await new Promise(r => setTimeout(r, 200));
        
        // 每 100 檔更新一次介面，讓使用者看到動態
        if (i % 100 === 0) setRawStocks({ ...newRawStocksTemp });
      }
      
      setRawStocks(newRawStocksTemp);
      setProgress(100);
      setStatusText('✅ 資料採集完成');
      setTimeout(() => setStatusText(''), 3000);
    } catch (e) {
      console.error('Fatal Load Error', e);
    } finally {
      setLoading(false);
    }
  }, [calculateIndicators]);

  // 核心：衍生狀態 - 當原始數據載入或日期變更時，本地即時計算
  const allData = useMemo(() => {
    const symbols = Object.keys(rawStocks);
    const results: IndicatorData[] = [];
    
    let targetTs: number | null = null;
    if (backtestDate) {
      const dt = new Date(backtestDate + 'T12:00:00+08:00');
      if (!isNaN(dt.getTime())) targetTs = Math.floor(dt.getTime() / 1000);
    }

    symbols.forEach(sym => {
      const raw = rawStocks[sym];
      let targetL = raw.prices.length - 1;
      
      if (targetTs !== null && raw.timestamps.length > 0) {
        let closestIdx = -1;
        let minDiff = Infinity;
        
        // 自動偵測單位 (秒 vs 毫秒)
        const isMs = raw.timestamps[0] > 10000000000;
        const adjustedTargetTs = isMs ? targetTs * 1000 : targetTs;
        const diffLimit = isMs ? 86400 * 3 * 1000 : 86400 * 3;

        for (let tIdx = 0; tIdx < raw.timestamps.length; tIdx++) {
           const diff = Math.abs(raw.timestamps[tIdx] - adjustedTargetTs);
           if (diff < minDiff) { minDiff = diff; closestIdx = tIdx; }
        }
        if (closestIdx !== -1 && minDiff < diffLimit) targetL = closestIdx;
      }

      // 檢查此索引是否有效且有數據
      if (targetL < 0 || targetL >= raw.prices.length) return;

      const res = calculateIndicators({
        symbol: sym.split('.')[0],
        name: raw.name,
        prices: raw.prices.slice(0, targetL + 1),
        volumes: raw.volumes.slice(0, targetL + 1),
        historyCount: targetL + 1
      });
      if (res) {
        // 格式化日期顯示 (同樣判斷單位)
        const isMs = raw.timestamps[0] > 10000000000;
        const tsVal = raw.timestamps[targetL];
        const ds = new Date(isMs ? tsVal : tsVal * 1000);
        res.date = isNaN(ds.getTime()) ? 'N/A' : `${ds.getMonth() + 1}/${ds.getDate()}`;
        results.push(res);
      }
    });
    
    return results;
  }, [rawStocks, backtestDate, calculateIndicators]);

  useEffect(() => {
    let cancelled = false;
    loadData(() => cancelled);
    return () => { cancelled = true; };
  }, [loadData]); 

  const filteredData = useMemo(() => {
    let list = allData;
    if (activeTags.length > 0) {
      list = allData.filter(item => activeTags.every(tagId => {
        const filter = FILTERS.find(f => f.id === tagId);
        return filter ? filter.fn(item) : true;
      }));
    }
    // 預設依漲跌幅排序，讓變化更明顯
    return [...list].sort((a, b) => b.changePercent - a.changePercent);
  }, [allData, activeTags]);

  const toggleTag = (id: string) => {
    setActiveTags(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]);
  };

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#020617', color: '#f8fafc', display: 'flex', flexDirection: 'column', fontFamily: 'system-ui, sans-serif', overflow: 'hidden' }}>
      <div style={{ padding: '20px', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#0f172a' }}>
         <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <button onClick={onBack} style={{ background: '#1e293b', color: '#f8fafc', border: '1px solid #334155', borderRadius: 8, padding: '8px 15px', cursor: 'pointer', fontWeight: 'bold' }}>{"< 返回"}</button>
            <h1 style={{ margin: 0, fontSize: '1.4rem', background: 'linear-gradient(to right, #38bdf8, #818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontWeight: '900' }}>智能選股 A.I.</h1>
            <div 
              onClick={() => { if(window.confirm('確定要清空緩存並重新採集歷史數據嗎？')) setRawStocks({}); }}
              style={{ marginLeft: '10px', fontSize: '0.75rem', color: '#38bdf8', background: '#1e293b', padding: '4px 10px', borderRadius: 4, cursor: 'pointer', border: '1px solid #38bdf8' }}
            >
              🔄 重新採集 (庫存 {Object.keys(rawStocks).length} 檔)
            </div>
            <div style={{ marginLeft: '5px', fontSize: '0.7rem', color: snapshotCount > 0 ? '#22c55e' : '#ef4444' }}>
              {snapshotCount > 0 ? `● 數據源已連線 (${snapshotCount})` : '○ 數據源連接中...'}
            </div>
            <div style={{ marginLeft: '10px', padding: '6px 12px', background: 'rgba(245, 158, 11, 0.1)', border: '2px solid #f59e0b', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
               <span style={{ fontSize: '0.85rem', color: '#f59e0b', fontWeight: 'bold' }}>回測日期:</span>
               <input 
                  type="date" 
                  value={stagedDate} 
                  onChange={(e) => setStagedDate(e.target.value)}
                  style={{ background: 'transparent', border: 'none', color: '#f8fafc', outline: 'none', fontSize: '0.9rem', colorScheme: 'dark' }}
               />
               <button 
                 onClick={() => setBacktestDate(stagedDate)}
                 style={{ 
                   background: stagedDate !== backtestDate ? '#f59e0b' : '#334155', 
                   color: stagedDate !== backtestDate ? '#020617' : '#94a3b8',
                   border: 'none', 
                   borderRadius: '4px', 
                   padding: '4px 12px', 
                   fontSize: '0.85rem', 
                   cursor: 'pointer', 
                   fontWeight: 'bold',
                   transition: 'all 0.3s ease',
                   boxShadow: stagedDate !== backtestDate ? '0 0 10px rgba(245,158,11,0.5)' : 'none'
                 }}
               >
                 {stagedDate !== backtestDate ? '⚡ 確認回測' : '已同步'}
               </button>
               {backtestDate && (
                 <button onClick={() => { setBacktestDate(''); setStagedDate(''); }} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1.2rem' }}>×</button>
               )}
            </div>
         </div>
         {loading && (
            <div style={{ flex: 1, marginLeft: '40px', maxWidth: '300px' }}>
               <div style={{ height: 6, background: '#1e293b', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${progress}%`, background: '#38bdf8', transition: 'width 0.3s ease' }} />
               </div>
               <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: 4 }}>{statusText}</div>
            </div>
         )}
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
         <div style={{ padding: '20px', borderBottom: '1px solid #1e293b', background: '#020617' }}>
            <div style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: 12 }}>選股策略 (可複選)</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
               {FILTERS.map(f => (
                 <button key={f.id} onClick={() => toggleTag(f.id)} style={{ padding: '8px 16px', borderRadius: '20px', border: '1px solid', borderColor: activeTags.includes(f.id) ? '#38bdf8' : '#334155', background: activeTags.includes(f.id) ? 'rgba(56, 189, 248, 0.1)' : '#1e293b', color: activeTags.includes(f.id) ? '#38bdf8' : '#94a3b8', cursor: 'pointer', fontSize: '0.9rem' }}>{f.label}</button>
               ))}
               <button onClick={() => setActiveTags([])} style={{ padding: '8px 16px', borderRadius: '20px', border: '1px solid #334155', background: 'transparent', color: '#64748b', cursor: 'pointer', fontSize: '0.9rem' }}>清除全部</button>
            </div>
            <div style={{ marginTop: '15px', fontSize: '0.9rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '20px' }}>
                <div>命中標的：<span style={{ color: '#38bdf8', fontWeight: 'bold' }}>{filteredData.length}</span> 檔</div>
                {backtestDate && (
                  <div style={{ background: '#f59e0b', color: '#020617', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                    回測模式: {backtestDate}
                  </div>
                )}
             </div>
         </div>
         <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
            {filteredData.length === 0 ? (
               <div style={{ textAlign: 'center', marginTop: '100px', color: '#475569' }}>
                  {loading ? '數據載入中，請稍候...' : '無符合條件之標的'}
               </div>
            ) : (
               <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
                  {filteredData.map(stock => (
                     <div key={stock.symbol} style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', padding: '15px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                           <span style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{stock.name} <span style={{ fontSize: '0.75rem', color: '#6366f1', fontWeight: 'normal' }}>({stock.date})</span></span>
                           <span style={{ color: '#94a3b8' }}>{stock.symbol}</span>
                        </div>
                         <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '0.85rem' }}>
                            <div style={{ color: '#94a3b8' }}>收盤：<span style={{ color: '#f8fafc' }}>{(stock.close || 0).toFixed(2)}</span></div>
                            <div style={{ color: '#94a3b8' }}>成交量：<span style={{ color: '#f8fafc' }}>{Math.round((stock.volume || 0) / 1000).toLocaleString()} 張</span> <span style={{ fontSize: '0.6rem', color: '#475569' }}>({stock.volume})</span></div>
                            <div style={{ color: '#94a3b8' }}>RSI(14)：<span style={{ color: stock.rsi > 80 ? '#ef4444' : stock.rsi < 20 ? '#22c55e' : '#f8fafc' }}>{(stock.rsi || 0).toFixed(1)}</span></div>
                            <div style={{ color: '#94a3b8' }}>MACD：<span style={{ color: stock.macdHist > 0 ? '#ef4444' : '#22c55e' }}>{(stock.macdHist || 0).toFixed(2)}</span></div>
                            <div style={{ gridColumn: 'span 2', fontSize: '0.65rem', color: '#475569', borderTop: '1px solid #1e293b', paddingTop: '5px', marginTop: '5px', display: 'flex', justifyContent: 'space-between' }}>
                                <span>索引: {stock.historyCount - 1} | 歷史: {stock.historyCount}天</span>
                                <span style={{ color: '#38bdf8' }}>{stock.date}</span>
                            </div>
                         </div>
                     </div>
                  ))}
               </div>
            )}
         </div>
      </div>
    </div>
  );
}
