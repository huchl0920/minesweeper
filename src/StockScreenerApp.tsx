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
  const [backtestDate, setBacktestDate] = useState(''); // YYYY-MM-DD
  const [stagedDate, setStagedDate] = useState(''); // 暫存日期，按下確認後才執行
  
  // 持久化原始歷史數據，避免重複抓取
  const [rawStocks, setRawStocks] = useState<{ [symbol: string]: { name: string, prices: number[], volumes: number[], timestamps: number[] } }>({});
  
  const calculateIndicators = useCallback((stock: StockData): IndicatorData | null => {
    const { prices, volumes } = stock;
    if (prices.length < 26) return null;

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

    const L = prices.length - 1;
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
      
      // --- 新增：全量快照捕獲 (強化：嘗試獲取多日成交量) ---
      const twseMasterMap: Record<string, { close: number; vol: number; volHistory: number[] }> = {};
      (window as any).twseMasterMap = twseMasterMap; 
      try {
        setStatusText(`正在同步全台股即時快照 (短期歷史補網中)...`);
        
        // 我們抓取今天與昨天的全量資料 (Web 接口支援 date 參數，但此處我們先做單日穩定版並確保 Key 正確)
        const [tseRes, otcRes] = await Promise.all([
          fetch(`/api/twse_open/v1/exchangeReport/STOCK_DAY_ALL`),
          fetch(`/api/tpex/openapi/v1/tpex_mainboard_quotes`)
        ]);
        
        // 輔助儲存函數
        const saveToMap = (code: string, close: number, vol: number) => {
          if (!code) return;
          if (!twseMasterMap[code]) twseMasterMap[code] = { close, vol, volHistory: [] };
          twseMasterMap[code].close = close;
          twseMasterMap[code].vol = vol;
          // 將今日成交量放入短期歷史末端
          twseMasterMap[code].volHistory.push(vol);
        };

        if (tseRes.ok) {
          const tseData = await tseRes.json();
          const items = Array.isArray(tseData) ? tseData : (tseData.data || []);
          items.forEach((s: any) => {
            const code = (s.Code || s.stock_id || '').trim();
            const close = parseFloat(s.ClosingPrice?.replace(/,/g, '') || s.Close?.replace(/,/g, '') || '0');
            const vol = parseInt(s.TradeVolume?.replace(/,/g, '') || s.TradingShares?.replace(/,/g, '') || '0');
            saveToMap(code, close, vol);
          });
        }
        // Fallback for TSE
        if (!tseRes.ok) {
           const webRes = await fetch(`/api/twse_www/exchangeReport/STOCK_DAY_ALL?response=json`);
           if (webRes.ok) {
             const webData = await webRes.json();
             (webData.data || []).forEach((row: any) => {
               const code = (row[0] || '').trim();
               saveToMap(code, parseFloat(row[7]?.replace(/,/g, '') || '0'), parseInt(row[2]?.replace(/,/g, '') || '0'));
             });
           }
        }

        if (otcRes.ok) {
          const otcData = await otcRes.json();
          const items = Array.isArray(otcData) ? otcData : (otcData.data || []);
          items.forEach((s: any) => {
            const code = (s.SecuritiesCompanyCode || s.stock_id || '').trim();
            const close = parseFloat(s.Close?.replace(/,/g, '') || s.ClosingPrice?.replace(/,/g, '') || '0');
            const vol = parseInt(s.TradingShares?.replace(/,/g, '') || s.TradeVolume?.replace(/,/g, '') || '0');
            saveToMap(code, close, vol);
          });
        }
      } catch (e) {
        console.error('[Screener] Snapshot failed:', e);
      }
      // ----------------------------------------

      const batchSize = 20; 
      const newRawStocksTemp: typeof rawStocks = {};
      
      for (let i = 0; i < fullList.length; i += batchSize) {
        const batch = fullList.slice(i, i + batchSize);
        const symbols = batch.map((s: any) => s.sym).join(',');
        
        let success = false;
        let retryCount = 0;
        
        while (!success && retryCount < 2) {
          try {
            console.log(`[Screener] Fetching batch ${i/batchSize}...`);
            
            // 策略：隔離請求 + 備援嘗試
            let sparkData: any = {};
            let quotes: any[] = [];
            
            // 備援目標判定
            const target = retryCount === 0 ? 'query2' : 'query1';

            // 1. 嘗試 Spark (需 Proxy 支援 Origin/Referer)
            try {
              // 一律抓 1 年，方便後續本地回測切換
              const range = '1y';
              const sRes = await fetch(`/api/yahoo/v7/finance/spark?symbols=${symbols}&range=${range}&interval=1d&includeVolume=true`);
              if (sRes.ok) sparkData = (await sRes.json()).spark?.result || {};
              else {
                console.warn(`[Screener] Spark ${sRes.status} on ${target}`);
                // 如果 Spark 401，嘗試用 FinMind 或 Chart API 單點突破 (此處暫時 Skip 以保證 Batch 效率)
              }
            } catch { /* ignore */ }

            // 2. 嘗試 Quote (主力現價/成交量來源)
            try {
              const qRes = await fetch(`/api/yahoo/v7/finance/quote?symbols=${symbols}`);
              if (qRes.ok) quotes = (await qRes.json()).quoteResponse?.result || [];
              else {
                 console.warn(`[Screener] Quote ${qRes.status} on ${target}`);
              }
            } catch { /* ignore */ }

            // 3. 終極備援：如果 Yahoo 全倒，嘗試直接從官方 mis.twse 獲取 (這需對代碼進行轉譯)
            if (quotes.length === 0) {
               console.log('[Screener] Attempting Official TWSE fallback...');
               try {
                  const twseSyms = batch.map((s: any) => `tse_${s.code}.tw`).join('|');
                  const tpexSyms = batch.map((s: any) => `otc_${s.code}.tw`).join('|');
                  const offRes = await fetch(`/api/twse/stock/api/getStockInfo.jsp?ex_ch=${twseSyms}|${tpexSyms}`);
                  if (offRes.ok) {
                     const offData = await offRes.json();
                     if (offData.msgArray) {
                        quotes = offData.msgArray.map((m: any) => ({
                           symbol: m.c + (m.ex === 'tse' ? '.TW' : '.TWO'),
                           regularMarketPrice: parseFloat(m.z) || parseFloat(m.y),
                           regularMarketVolume: (parseInt(m.v) || 0) * 1000 // 單位轉換
                        }));
                     }
                  }
               } catch { /* ignore */ }
            }

            if (Object.keys(sparkData).length === 0 && quotes.length === 0) {
               throw new Error('All Data Sources Unavailable');
            }

            batch.forEach((stock: any) => {
              const spark = sparkData[stock.sym] || (Array.isArray(sparkData) ? sparkData.find?.((r: any) => r.symbol === stock.sym) : null);
              const quote = quotes.find((q: any) => q.symbol === stock.sym || q.symbol?.split('.')[0] === stock.code);
              
              const response = spark?.response?.[0] || spark;
              const indicatorsRaw = response?.indicators?.quote?.[0] || response;
              const tsRaw: number[] = response?.timestamp || spark?.timestamp || [];
              
              const existingSnapshot = twseMasterMap[stock.code];
              const currentP = quote?.regularMarketPrice || (indicatorsRaw?.close ? (indicatorsRaw.close[indicatorsRaw.close.length - 1] as number) : (existingSnapshot?.close || 0));
              
              if (currentP > 0) {
                const closeRaw: (number | null)[] = indicatorsRaw?.close || [currentP, currentP]; 
                const volRaw: (number | null)[] = indicatorsRaw?.volume || new Array(closeRaw.length).fill(0);
                
                const existingSnapshot = twseMasterMap[stock.code];
                if (i === 0) console.log(`[Screener] Example Lookup [${stock.code}]:`, existingSnapshot);
                
                const zip = closeRaw.map((p, idx) => {
                  let v = (volRaw[idx] || 0) as number;
                  // 強制對最後一筆數據使用快照量能，不再依賴 Yahoo 的判斷
                  if (idx === closeRaw.length - 1 && existingSnapshot) {
                    v = existingSnapshot.vol;
                  }
                  return { p: p as number, v, t: tsRaw[idx] };
                }).filter((item) => item.p !== null && typeof item.t === 'number' && !isNaN(item.t));
                
                if (zip.length > 0) {
                  newRawStocksTemp[stock.sym] = {
                    name: stock.name,
                    prices: zip.map(z => z.p),
                    volumes: zip.map(z => z.v),
                    timestamps: zip.map(z => z.t)
                  };
                }
              }
            });
            success = true;
          } catch (err) {
            console.warn(`[Screener] Batch fail (retry ${retryCount}):`, err);
            retryCount++;
            await new Promise(r => setTimeout(r, 2000));
          }
        }
        
        if (isCancelled()) return;
        
        // 每 4 個 Batch 更新一次 Raw 快取
        if (i % (batchSize * 4) === 0 || i + batchSize >= total) {
           setRawStocks(prev => ({ ...prev, ...newRawStocksTemp }));
        }
        
        setProgress(Math.min(100, Math.round(((i + batchSize) / total) * 100)));
        setStatusText(`正在處理... (已採集 ${Object.keys(newRawStocksTemp).length} 檔)`);
        await new Promise(r => setTimeout(r, 600)); 
      }
      
      if (isCancelled()) return;
      setStatusText('');
    } catch (e) {
      console.error('[Screener] Load Fatal:', e);
      setStatusText('部分來源失效，可以嘗試重新載入');
    } finally {
      if (!isCancelled()) {
        setLoading(false);
      }
    }
  }, [calculateIndicators]); // 移除 backtestDate 依賴，採集不應隨日期重跑

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
                           <div style={{ color: '#94a3b8' }}>收盤：<span style={{ color: '#f8fafc' }}>{stock.close.toFixed(2)}</span></div>
                           <div style={{ color: '#94a3b8' }}>成交量：<span style={{ color: '#f8fafc' }}>{Math.round(stock.volume / 1000).toLocaleString()} 張</span></div>
                           <div style={{ color: '#94a3b8' }}>RSI(14)：<span style={{ color: stock.rsi > 80 ? '#ef4444' : stock.rsi < 20 ? '#22c55e' : '#f8fafc' }}>{stock.rsi.toFixed(1)}</span></div>
                           <div style={{ color: '#94a3b8' }}>MACD：<span style={{ color: stock.macdHist > 0 ? '#ef4444' : '#22c55e' }}>{stock.macdHist.toFixed(2)}</span></div>
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
