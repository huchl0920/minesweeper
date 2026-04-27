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
  isBullishAlignment: boolean;
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
  { id: 'rsiLow', label: 'RSI < 20', fn: (d) => d.rsi < 20 && d.rsi > 0 },
  { id: 'rsiHigh', label: 'RSI > 80', fn: (d) => d.rsi > 80 }
];

export default function StockScreenerApp({ onBack }: { onBack: () => void }) {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [allData, setAllData] = useState<IndicatorData[]>([]);
  const [activeTags, setActiveTags] = useState<string[]>([]);
  
  const calculateIndicators = useCallback((stock: StockData): IndicatorData | null => {
    const { prices, volumes } = stock;
    if (prices.length < 26) return null;

    const getMA = (arr: number[], period: number, endIdx: number) => {
       if (endIdx < period - 1) return 0;
       return arr.slice(endIdx - period + 1, endIdx + 1).reduce((a, b) => a + b, 0) / period;
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
       isBullishAlignment: false
    };
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setProgress(0);
    setStatusText('正在獲取市場清單...');
    try {
      const resList = await fetch('/api/finmind/api/v4/data?dataset=TaiwanStockInfo');
      const jsonList = await resList.json();
      const rawData = (jsonList.data || []).map((r: any) => ({
        code: r.stock_id,
        name: r.stock_name,
        type: r.type,
        sym: r.stock_id + (r.type === 'tse' || r.type === 'twse' ? '.TW' : '.TWO')
      })).filter((s: any) => /^[0-9]{4}$/.test(s.code));
      
      const seen = new Set();
      const fullList = rawData.filter((s: any) => seen.has(s.sym) ? false : seen.add(s.sym));
      const total = fullList.length;
      setStatusText(`共找到 ${total} 檔股票，開始採集量價歷史...`);

      const batchSize = 20; 
      const processed: IndicatorData[] = [];
      
      for (let i = 0; i < fullList.length; i += batchSize) {
        const batch = fullList.slice(i, i + batchSize);
        const symbols = batch.map((s: any) => s.sym).join(',');
        
        let success = false;
        let retryCount = 0;
        
        while (!success && retryCount < 3) {
          try {
            const res = await fetch(`/api/yahoo/v7/finance/spark?symbols=${symbols}&range=3mo&interval=1d`);
            if (res.status === 429) {
               await new Promise(r => setTimeout(r, 2000 * (retryCount + 1))); // 等待後重試
               retryCount++;
               continue;
            }
            const data = await res.json();
            
            batch.forEach((stock: any) => {
            const spark = data[stock.sym];
            if (spark && spark.close) {
              const closeRaw = spark.close;
              const volRaw = spark.volume || new Array(closeRaw.length).fill(0);
              const zip = closeRaw.map((p: any, idx: number) => ({ p, v: volRaw[idx] || 0 }))
                                  .filter((item: any) => item.p !== null);
              const prices = zip.map((item: any) => item.p);
              const volumes = zip.map((item: any) => item.v);
              
              if (prices.length >= 26) {
                const resInd = calculateIndicators({
                  symbol: stock.code,
                  name: stock.name,
                  prices,
                  volumes,
                  historyCount: prices.length
                });
                if (resInd) processed.push(resInd);
              }
            }
          });
            success = true;
          } catch (err) {
            console.warn('Batch fail:', err);
            retryCount++;
            await new Promise(r => setTimeout(r, 1000));
          }
        }
        
        setProgress(Math.min(100, Math.round(((i + batchSize) / total) * 100)));
        setStatusText(`正在處理... (${processed.length} 檔已就緒)`);
        await new Promise(r => setTimeout(r, 800)); // 節流
      }
      
      setAllData(processed);
      setStatusText('');
    } catch (e) {
      console.error(e);
      setStatusText('載入失敗');
    } finally {
      setLoading(false);
    }
  }, [calculateIndicators]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredData = useMemo(() => {
    if (activeTags.length === 0) return allData;
    return allData.filter(item => activeTags.every(tagId => {
      const filter = FILTERS.find(f => f.id === tagId);
      return filter ? filter.fn(item) : true;
    }));
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
            <div style={{ marginTop: '15px', fontSize: '0.9rem', color: '#94a3b8' }}>命中標的：<span style={{ color: '#38bdf8', fontWeight: 'bold' }}>{filteredData.length}</span> 檔</div>
         </div>
         <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
            {activeTags.length === 0 ? (
               <div style={{ textAlign: 'center', marginTop: '100px', color: '#475569' }}>
                  <div style={{ fontSize: '3rem', marginBottom: '20px' }}>🔍</div>
                  <div>請點選上方標籤開始進行大數據篩選</div>
               </div>
            ) : filteredData.length === 0 ? (
               <div style={{ textAlign: 'center', marginTop: '100px', color: '#475569' }}>無符合條件之標的</div>
            ) : (
               <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
                  {filteredData.map(stock => (
                     <div key={stock.symbol} style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', padding: '15px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                           <span style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{stock.name}</span>
                           <span style={{ color: '#94a3b8' }}>{stock.symbol}</span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '0.85rem' }}>
                           <div style={{ color: '#94a3b8' }}>收盤：<span style={{ color: '#f8fafc' }}>{stock.close.toFixed(2)}</span></div>
                           <div style={{ color: '#94a3b8' }}>RSI(14)：<span style={{ color: stock.rsi > 80 ? '#ef4444' : stock.rsi < 20 ? '#22c55e' : '#f8fafc' }}>{stock.rsi.toFixed(1)}</span></div>
                           <div style={{ color: '#94a3b8' }}>MACD：<span style={{ color: stock.macdHist > 0 ? '#ef4444' : '#22c55e' }}>{stock.macdHist.toFixed(2)}</span></div>
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
