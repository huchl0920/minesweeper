import { useState, useEffect, useRef } from 'react';

// --- Data Fetching Logic ---
interface StockData {
  code: string;
  name: string;
  price: number;
  previousClose: number;
  history: { price: number; time: number }[]; 
  currency: string;
  open: number;
  high: number;
  low: number;
  volume: number;
  instData: { fNet: string; iNet: string; dNet: string; totalNet: string } | null;
}

const getWatchlist = (): string[] => {
   try { return JSON.parse(localStorage.getItem('stock_watchlist') || '["2330", "0050", "2317"]'); }
   catch { return ['2330', '0050', '2317']; }
};
const saveWatchlist = (wl: string[]) => localStorage.setItem('stock_watchlist', JSON.stringify(wl));

function TrendChart({ data }: { data: { price: number; time: number }[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [chartWidth, setChartWidth] = useState(0);

  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current) setChartWidth(canvasRef.current.getBoundingClientRect().width);
    };
    window.addEventListener('resize', handleResize);
    handleResize(); // Initial measurement
    return () => window.removeEventListener('resize', handleResize);
  }, [data]);

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    setChartWidth(rect.width);
    const x = e.clientX - rect.left;
    const idx = Math.round((x / rect.width) * (data.length - 1));
    setHoverIndex(Math.max(0, Math.min(idx, data.length - 1)));
  };
  
  useEffect(() => {
    const cvs = canvasRef.current;
    if(!cvs || data.length === 0) return;
    const ctx = cvs.getContext('2d');
    if(!ctx) return;
    
    // Auto resize canvas resolution using its client width/height
    const rect = cvs.getBoundingClientRect();
    if (cvs.width !== rect.width || cvs.height !== rect.height) {
       cvs.width = rect.width;
       cvs.height = rect.height;
    }

    const w = cvs.width; const h = cvs.height;
    ctx.clearRect(0, 0, w, h);
    
    const prices = data.map(d => d.price);
    let max = Math.max(...prices); let min = Math.min(...prices);
    const range = max - min || 1;
    max += range * 0.15; min -= range * 0.15;
    const realRange = max - min;
    
    const isUp = prices[prices.length-1] >= prices[0]; 
    const color = isUp ? '#ef4444' : '#22c55e'; // Red implies up in TW
    const fillColor = isUp ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)';

    ctx.beginPath();
    prices.forEach((val, i) => {
        const x = (i / (prices.length - 1)) * w;
        const y = h - ((val - min) / realRange) * h;
        if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    });
    ctx.lineJoin = 'round'; ctx.lineWidth = 3; ctx.strokeStyle = color; ctx.stroke();

    ctx.lineTo(w, h); ctx.lineTo(0, h);
    ctx.fillStyle = fillColor; ctx.fill();

  }, [data]);
  
  return (
    <div 
      style={{ position: 'relative', width: '100%', height: '250px', touchAction: 'pan-y' }}
      onPointerMove={handlePointerMove}
      onPointerDown={handlePointerMove}
      onPointerLeave={() => setHoverIndex(null)}
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', borderRadius: 12, background: '#1e293b' }} />
      {hoverIndex !== null && chartWidth > 0 && (() => {
         const pt = data[hoverIndex];
         const leftPos = (hoverIndex / (data.length - 1)) * chartWidth;
         // Adjust date visually. Yahoo returns timestamps that format to JS Date.
         const dateObj = new Date(pt.time * 1000);
         const dateStr = `${dateObj.getFullYear()}/${(dateObj.getMonth()+1).toString().padStart(2,'0')}/${dateObj.getDate().toString().padStart(2,'0')}`;

         return (
            <>
               <div style={{ position: 'absolute', top: 0, bottom: 0, left: leftPos, borderLeft: '1px dashed #94a3b8', pointerEvents: 'none', zIndex: 5 }} />
               
               <div style={{
                   position: 'absolute', 
                   top: 15, 
                   left: hoverIndex > data.length / 2 ? undefined : leftPos + 15,
                   right: hoverIndex > data.length / 2 ? chartWidth - leftPos + 15 : undefined,
                   background: 'rgba(15, 23, 42, 0.85)', 
                   backdropFilter: 'blur(8px)',
                   border: '1px solid #334155', 
                   padding: '10px 15px', 
                   borderRadius: 8, 
                   pointerEvents: 'none',
                   boxShadow: '0 4px 15px rgba(0,0,0,0.5)',
                   color: '#f8fafc',
                   zIndex: 10,
                   minWidth: 100
               }}>
                   <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: 5 }}>{dateStr}</div>
                   <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#38bdf8' }}>${pt.price.toFixed(2)}</div>
               </div>
               
               {/* Hover Ring Indicator */}
               <div style={{ 
                   position: 'absolute', 
                   top: `calc(100% - ${ ((pt.price - Math.min(...data.map(d=>d.price)) + (Math.max(...data.map(d=>d.price))-Math.min(...data.map(d=>d.price)) || 1)*0.15) / ((Math.max(...data.map(d=>d.price))-Math.min(...data.map(d=>d.price)) || 1)*1.3) ) * 100 }%)`, 
                   left: leftPos, 
                   transform: 'translate(-50%, -50%)', 
                   width: 10, height: 10, borderRadius: '50%', background: '#0f172a', border: '2px solid #38bdf8',
                   pointerEvents: 'none', zIndex: 6
               }} />
            </>
         )
      })()}
    </div>
  );
}

export default function EtfApp({ onBack }: { onBack: () => void }) {
  const [watchlist, setWatchlist] = useState<string[]>(getWatchlist());
  const [stockDataMap, setStockDataMap] = useState<Record<string, StockData | null>>({});
  const [searchQuery, setSearchQuery] = useState('');
  
  const [searchSuggestions, setSearchSuggestions] = useState<{code:string, name: string}[]>([]);
  const [t86Record, setT86Record] = useState<Record<string, { fNet: string, iNet: string, dNet: string, totalNet: string }>>({});
  
  const [viewMode, setViewMode] = useState<'list' | 'detail'>('list');
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [loadingCode, setLoadingCode] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  
  // T86 Institutions EOD Data (TWSE Only)
  useEffect(() => {
    const fetchT86 = async () => {
         try {
            const res = await fetch(`/api/twse_www/fund/T86?response=json&selectType=ALL`);
            const text = await res.text();
            // Just in case it's HTML due to 403 Forbidden on Vercel
            if(text.startsWith('<')) return;
            const j = JSON.parse(text);
            if(j.data && j.fields) {
               const record: Record<string, any> = {};
               const idxOuter = j.fields.indexOf('外陸資買賣超股數(不含外資自營商)');
               const idxTrust = j.fields.indexOf('投信買賣超股數');
               const idxDealer = j.fields.indexOf('自營商買賣超股數'); 
               const idxTotal = j.fields.indexOf('三大法人買賣超股數');
               
               j.data.forEach((row: string[]) => {
                  record[row[0]] = {
                     fNet: idxOuter >= 0 ? row[idxOuter] : '0',
                     iNet: idxTrust >= 0 ? row[idxTrust] : '0',
                     dNet: idxDealer >= 0 ? row[idxDealer] : '0',
                     totalNet: idxTotal >= 0 ? row[idxTotal] : '0',
                  };
               });
               setT86Record(record);
            }
         } catch(e) {
            console.warn("TWSE T86 skipped or blocked", e);
         }
    };
    fetchT86();
  }, []);

  // Dynamic Yahoo Search Autocomplete
  useEffect(() => {
      if (searchQuery.trim().length === 0) {
          setSearchSuggestions([]);
          return;
      }
      const timeoutId = setTimeout(async () => {
          try {
              const res = await fetch(`/api/yahoo/v1/finance/search?q=${encodeURIComponent(searchQuery)}&quotesCount=10`);
              const text = await res.text();
              if(text.startsWith('<')) return; // Vercel 403 handle
              const j = JSON.parse(text);
              if (j.quotes) {
                  const resList = j.quotes
                      .filter((q: any) => (q.exchange === 'TAI' || q.exchange === 'TWO') && (q.quoteType === 'EQUITY' || q.quoteType === 'ETF'))
                      .map((q: any) => ({ code: q.symbol.replace(/\.TW|\.TWO/g, ''), name: q.shortname || q.longname || q.symbol }));
                  setSearchSuggestions(resList);
              }
          } catch(e) {}
      }, 300);
      return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  const fetchStockInfo = async (rawCode: string) => {
    const code = rawCode.toUpperCase();
    try {
      setLoadingCode(code);
      
      let symbol = `${code}.TW`;
      let res = await fetch(`/api/yahoo/v8/finance/chart/${symbol}?range=1mo&interval=1d`);
      let text = await res.text();
      let json = text.startsWith('<') ? {chart:{result:null, error:'Vite Fallback or 403 HTML'}} : JSON.parse(text);
      
      // Fallback for Taipei Exchange (OTC) ETFs/Stocks
      if (!json.chart || !json.chart.result || json.chart.error !== null) {
          symbol = `${code}.TWO`;
          res = await fetch(`/api/yahoo/v8/finance/chart/${symbol}?range=1mo&interval=1d`);
          text = await res.text();
          json = text.startsWith('<') ? {chart:{result:null, error:'Vite Fallback or 403 HTML'}} : JSON.parse(text);
      }
      
      const result = json.chart?.result?.[0];
      if (!result) throw new Error('無此代碼資料');

      const meta = result.meta;
      
      const rawClose = result.indicators.quote[0].close;
      const rawTime = result.timestamp;
      const history: {price: number; time: number}[] = [];
      
      if (rawClose && rawTime) {
          for (let i = 0; i < rawClose.length; i++) {
              if (rawClose[i] !== null) {
                  history.push({ price: rawClose[i], time: rawTime[i] });
              }
          }
      }
      
      const yahooName = meta.longName || meta.shortName || `Stock ${code}`;
      const realPreviousClose = history.length > 1 ? history[history.length - 2].price : meta.regularMarketPrice;

      const dataObj: StockData = {
        code,
        name: yahooName,
        price: meta.regularMarketPrice,
        previousClose: realPreviousClose,
        history,
        currency: meta.currency,
        open: meta.regularMarketOpen || meta.regularMarketPrice,
        high: meta.regularMarketDayHigh || meta.regularMarketPrice,
        low: meta.regularMarketDayLow || meta.regularMarketPrice,
        volume: meta.regularMarketVolume || 0,
        instData: t86Record[code] || null
      };
      
      setStockDataMap(prev => ({...prev, [code]: dataObj}));
      return dataObj;
    } catch (err) {
      console.error(err);
      return null;
    } finally {
      setLoadingCode(null);
    }
  };

  useEffect(() => {
    watchlist.forEach(code => {
      if (!stockDataMap[code]) fetchStockInfo(code);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchlist]);

  const handleAdd = async (inputCode?: string) => {
    const code = (inputCode || searchQuery).trim().toUpperCase();
    if (!code) return;
    const data = await fetchStockInfo(code);
    if (!data) {
      alert(`找不到代碼 ${code} 的資料`);
      return;
    }
    setSearchQuery('');
    setSearchSuggestions([]);
    setShowSuggestions(false);
    if (!watchlist.includes(code)) {
      const newWl = [...watchlist, code];
      setWatchlist(newWl);
      saveWatchlist(newWl);
    }
  };

  const handleRemove = (code: string) => {
    const newWl = watchlist.filter(c => c !== code);
    setWatchlist(newWl);
    saveWatchlist(newWl);
    if (viewMode === 'detail' && selectedCode === code) setViewMode('list');
  };

  const openDetail = (code: string) => {
    setSelectedCode(code);
    setViewMode('detail');
  };

  // Assign the fetched detail to variables and patch in any late-arriving T86 records
  const currentSelectedData = selectedCode ? stockDataMap[selectedCode] : null;

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#0f172a', color: '#f8fafc', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      
      {/* List View */}
      {viewMode === 'list' && (
        <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto', width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
           <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', marginBottom: 30, gap: 15 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
                 <button onClick={onBack} style={{ background: '#1e293b', border: '1px solid #334155', color: '#38bdf8', borderRadius: 8, padding: '8px 15px', cursor: 'pointer', fontWeight: 'bold' }}>{"< 退出"}</button>
                 <h1 style={{ margin: 0, fontSize: '1.5rem' }}>📈 台股報價</h1>
              </div>
              <div style={{ display: 'flex', gap: 10, flex: '1 1 300px' }}>
                 <div style={{ position: 'relative', flex: 1 }}>
                    <input 
                      type="text" 
                      placeholder="輸入代碼或名稱新增 (例 2330 / 台積電)" 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onFocus={() => setShowSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowSuggestions(false), 150)} // Delay for click selection
                      onKeyDown={(e) => { if(e.key==='Enter') handleAdd(); }}
                      style={{ width: '100%', boxSizing: 'border-box', padding: '12px 15px', borderRadius: 12, border: '1px solid #334155', background: '#1e293b', color: '#fff', outline: 'none', fontSize: '1rem' }}
                    />
                    {showSuggestions && searchQuery.trim().length > 0 && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, width: '100%', background: '#1e293b', border: '1px solid #334155', borderRadius: 12, marginTop: 5, zIndex: 50, overflow: 'hidden', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.5)' }}>
                         {searchSuggestions.map((info) => (
                           <div key={info.code} 
                                onMouseDown={() => handleAdd(info.code)}
                                style={{ padding: '10px 15px', cursor: 'pointer', borderBottom: '1px solid #0f172a', transition: 'background 0.2s' }}
                                onMouseEnter={e => e.currentTarget.style.background = '#334155'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                           >
                              <b style={{ color: '#38bdf8', marginRight: 10 }}>{info.code}</b> {info.name}
                           </div>
                         ))}
                         
                         {searchSuggestions.length === 0 && (
                             <div onMouseDown={() => handleAdd()}
                                  style={{ padding: '10px 15px', cursor: 'pointer', color: '#94a3b8', transition: 'background 0.2s' }}
                                  onMouseEnter={e => e.currentTarget.style.background = '#334155'}
                                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                             >
                                🔍 嘗試線上強制尋找 <b style={{ color: '#fff' }}>{searchQuery.trim().toUpperCase()}</b>
                             </div>
                         )}
                      </div>
                    )}
                 </div>
                 <button onClick={() => handleAdd()} disabled={loadingCode !== null} style={{ background: '#38bdf8', color: '#0f172a', border: 'none', borderRadius: 12, padding: '0 20px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem' }}>
                   {loadingCode ? '...' : '新增'}
                 </button>
              </div>
           </div>

           <div style={{ flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px', alignContent: 'start', paddingBottom: 100 }}>
              {watchlist.length === 0 && <div style={{ color: '#64748b', textAlign: 'center', gridColumn: '1 / -1', marginTop: 50 }}>尚無自選，請從上方搜尋代碼或名稱新增</div>}
              
              {watchlist.map(code => {
                const data = stockDataMap[code];
                if (loadingCode === code && !data) {
                   return <div key={code} style={{ background: '#1e293b', padding: 20, borderRadius: 16, height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>載入中...</div>
                }
                if (!data) {
                   return <div key={code} style={{ background: '#1e293b', padding: 20, borderRadius: 16, color: '#ef4444' }}>載入失敗: {code} <button onClick={() => handleRemove(code)} style={{float:'right', color:'#ef4444', background:'none', border:'none'}}>移除</button></div>
                }

                const diff = data.price - data.previousClose;
                const isUp = diff >= 0;
                
                return (
                  <div key={code} 
                       onClick={() => openDetail(code)}
                       style={{ background: '#1e293b', padding: '20px', borderRadius: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', cursor: 'pointer', transition: 'transform 0.2s', border: '1px solid #334155' }}
                       onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-3px)'}
                       onMouseLeave={e => e.currentTarget.style.transform = 'none'}
                  >
                     <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
                        <div>
                           <div style={{ fontSize: '1.2rem', fontWeight: 'bold', marginBottom: 4 }}>{data.name}</div>
                           <div style={{ color: '#94a3b8', fontSize: '0.9rem' }}>{code}</div>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); handleRemove(code); }} style={{ background: 'transparent', border:'none', color:'#475569', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
                     </div>
                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                        <div style={{ fontSize: '2rem', fontWeight: 'bold', color: isUp ? '#ef4444' : '#22c55e' }}>{data.price.toFixed(2)}</div>
                        <div style={{ color: isUp ? '#ef4444' : '#22c55e', fontWeight: 'bold', background: isUp ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)', padding: '4px 8px', borderRadius: 8 }}>
                           {isUp ? '+' : ''}{diff.toFixed(2)} ({isUp ? '+' : ''}{((diff / data.previousClose) * 100).toFixed(2)}%)
                        </div>
                     </div>
                  </div>
                )
              })}
           </div>
        </div>
      )}

      {/* Detail View */}
      {viewMode === 'detail' && currentSelectedData && (() => {
         const data = currentSelectedData;
         // In case the T86 record finished loading AFTER the stock object was stored, we can patch it in render directly!
         const lateInstData = t86Record[data.code] || data.instData; 
         
         const isUp = (data.price - data.previousClose) >= 0;
         const formatVol = (v: number) => (v / 1000).toLocaleString(undefined, {maximumFractionDigits: 0}) + ' 萬股';
         const formatNum = (strNum: string) => {
            const val = parseInt(strNum.replace(/,/g, ''), 10);
            if (isNaN(val)) return '0 張';
            const shares = val / 1000;
            return shares > 0 ? `+${shares.toLocaleString(undefined, {maximumFractionDigits: 0})} 張` : `${shares.toLocaleString(undefined, {maximumFractionDigits: 0})} 張`;
         };

         return (
            <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#0f172a' }}>
               <div style={{ padding: '20px', borderBottom: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <button onClick={() => setViewMode('list')} style={{ background: '#1e293b', color: '#f8fafc', border: '1px solid #334155', borderRadius: 8, padding: '8px 15px', cursor: 'pointer', fontWeight: 'bold' }}>{"< 回自選清單"}</button>
                  <button onClick={() => handleRemove(data.code)} style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: 'none', borderRadius: 8, padding: '8px 15px', cursor: 'pointer', fontWeight: 'bold' }}>移除</button>
               </div>
               
               <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 100px 20px', maxWidth: '800px', margin: '0 auto', width: '100%' }}>
                  <div style={{ marginBottom: 30 }}>
                     <h1 style={{ fontSize: '2.5rem', margin: '0 0 10px 0', color: '#f8fafc' }}>
                        {data.name} <span style={{ fontSize: '1.2rem', color: '#64748b', verticalAlign: 'middle', background: '#1e293b', padding: '4px 8px', borderRadius: 8 }}>{data.code}</span>
                     </h1>
                  </div>

                  {/* Pricing Overview Cards */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '15px', marginBottom: '30px' }}>
                     <div style={{ background: '#1e293b', padding: '15px', borderRadius: '16px', border: '1px solid #334155' }}>
                        <div style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: 5 }}>收盤價</div>
                        <div style={{ fontSize: '2rem', fontWeight: 'bold', color: isUp ? '#ef4444' : '#22c55e' }}>{data.price.toFixed(2)}</div>
                     </div>
                     <div style={{ background: '#1e293b', padding: '15px', borderRadius: '16px', border: '1px solid #334155' }}>
                        <div style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: 5 }}>開盤價</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#cbd5e1' }}>{data.open.toFixed(2)}</div>
                     </div>
                     <div style={{ background: '#1e293b', padding: '15px', borderRadius: '16px', border: '1px solid #334155' }}>
                        <div style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: 5 }}>最高價</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#ef4444' }}>{data.high.toFixed(2)}</div>
                     </div>
                     <div style={{ background: '#1e293b', padding: '15px', borderRadius: '16px', border: '1px solid #334155' }}>
                        <div style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: 5 }}>最低價</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#22c55e' }}>{data.low.toFixed(2)}</div>
                     </div>
                     <div style={{ background: '#1e293b', padding: '15px', borderRadius: '16px', border: '1px solid #334155' }}>
                        <div style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: 5 }}>總名目成交量</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#38bdf8' }}>{formatVol(data.volume)}</div>
                     </div>
                     <div style={{ background: '#1e293b', padding: '15px', borderRadius: '16px', border: '1px dashed #475569' }}>
                        <div style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: 5 }}>單日漲跌幅</div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: isUp ? '#ef4444' : '#22c55e' }}>
                           {(((data.price / data.previousClose) - 1) * 100).toFixed(2)}%
                        </div>
                     </div>
                  </div>

                  {/* Institutional Investors (三大法人) */}
                  <div style={{ background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', padding: '25px', borderRadius: '16px', border: '1px solid #475569', marginBottom: '30px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.3)' }}>
                     <h3 style={{ color: '#f8fafc', margin: '0 0 20px 0', fontSize: '1.2rem', display: 'flex', alignItems: 'center' }}>
                        <span style={{ marginRight: 10, background: '#38bdf8', padding: '4px 8px', borderRadius: 8, fontSize: '0.9rem', color: '#0f172a' }}>盤後</span> 近期三大法人買賣超
                     </h3>
                     
                     {lateInstData ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px' }}>
                           <div style={{ flex: 1, minWidth: '100px' }}>
                              <div style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: 5 }}>外資及陸資</div>
                              <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: lateInstData.fNet.includes('-') ? '#22c55e' : '#ef4444' }}>{formatNum(lateInstData.fNet)}</div>
                           </div>
                           <div style={{ flex: 1, minWidth: '100px' }}>
                              <div style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: 5 }}>投信</div>
                              <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: lateInstData.iNet.includes('-') ? '#22c55e' : '#ef4444' }}>{formatNum(lateInstData.iNet)}</div>
                           </div>
                           <div style={{ flex: 1, minWidth: '100px' }}>
                              <div style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: 5 }}>自營商</div>
                              <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: lateInstData.dNet.includes('-') ? '#22c55e' : '#ef4444' }}>{formatNum(lateInstData.dNet)}</div>
                           </div>
                           <div style={{ flex: 1, minWidth: '100px', borderLeft: '1px solid #475569', paddingLeft: 20 }}>
                              <div style={{ color: '#cbd5e1', fontSize: '0.85rem', marginBottom: 5 }}>法人總計</div>
                              <div style={{ fontSize: '1.6rem', fontWeight: 'bold', color: lateInstData.totalNet.includes('-') ? '#22c55e' : '#ef4444' }}>{formatNum(lateInstData.totalNet)}</div>
                           </div>
                        </div>
                     ) : (
                        <div style={{ color: '#64748b', fontStyle: 'italic', padding: '10px 0' }}>
                           無盤後籌碼公開資料 (需為上市股票，或遇到 Vercel IP 防火牆阻擋)
                        </div>
                     )}
                  </div>

                  {/* Chart */}
                  <div>
                     <h3 style={{ color: '#94a3b8', marginBottom: 15, fontSize: '1.2rem' }}>📊 近一月走勢</h3>
                     {data.history && data.history.length > 0 ? (
                        <TrendChart data={data.history} />
                     ) : (
                        <div style={{ background: '#1e293b', padding: 40, textAlign: 'center', color: '#64748b', borderRadius: 16 }}>無歷史資料可供繪製</div>
                     )}
                  </div>
               </div>
            </div>
         );
      })()}
    </div>
  );
}
