import { useState, useRef } from 'react';
import './StockStrategyApp.css'; // Reuse existing styles
import { fetchYahooHistory } from './utils/fiboLogic'; // Corrected import path

interface Props {
  onBack: () => void;
}

interface StockInfo {
  code: string;
  name: string;
  sym: string;
}

export default function DataExportApp({ onBack }: Props) {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ cur: 0, total: 0, text: '' });
  const [error, setError] = useState<string | null>(null);
  const [fetchedData, setFetchedData] = useState<Record<string, any>>({});
  
  const cancelRef = useRef(false);

  // Fetch the full list of Taiwan stocks (TSE + OTC)
  const getStockList = async (): Promise<StockInfo[]> => {
    setProgress({ cur: 0, total: 0, text: '📋 正在從 TWSE + TPEX 取得台股清單...' });
    const stockMap: Record<string, StockInfo> = {};

    // Source A: TWSE OpenAPI - Listed stocks (~900)
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

    // Source B: TPEX OpenAPI - OTC stocks (~800)
    try {
      const tpexRes = await fetch('/api/tpex/openapi/v1/tpex_mainboard_quotes');
      if (tpexRes.ok) {
        const tpexData = await tpexRes.json();
        (Array.isArray(tpexData) ? tpexData : []).forEach((s: any) => {
          const code = s.SecuritiesCompanyCode || s.Code || s.stockCode || s[0];
          const name = s.CompanyName || s.Name || s.stockName || s[1] || code;
          if (typeof code === 'string' && /^[0-9]{4}$/.test(code) && !stockMap[code]) {
            stockMap[code] = { code, name, sym: code + '.TWO' };
          }
        });
      }
    } catch { /* continue */ }

    // Source C: FinMind Backup
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
      } catch { /* ignore */ }
    }

    return Object.values(stockMap);
  };

  const handleStartExport = async () => {
    cancelRef.current = false;
    setLoading(true);
    setError(null);
    setFetchedData({});
    
    const aggregatedData: Record<string, any> = {};

    try {
      const list = await getStockList();
      if (list.length === 0) throw new Error('無法取得股票清單，請確認網路或 API 服務是否正常。');

      setProgress({ cur: 0, total: list.length, text: `✅ 取得 ${list.length} 檔股票，開始下載歷史資料...` });
      
      const batchSize = 10;
      let failCount = 0;

      for (let i = 0; i < list.length; i += batchSize) {
        if (cancelRef.current) {
           setProgress(prev => ({ ...prev, text: `🛑 已中斷下載，共取得 ${Object.keys(aggregatedData).length} 檔資料。` }));
           break;
        }

        const batch = list.slice(i, i + batchSize);
        setProgress({ 
          cur: i, 
          total: list.length, 
          text: `下載進度: ${i}/${list.length} 檔 | 成功: ${Object.keys(aggregatedData).length} | 失敗: ${failCount}` 
        });

        const batchPromises = batch.map(async (stock) => {
          try {
            const hist = await fetchYahooHistory(stock.sym, '1y');
            if (hist && hist.length > 0) {
              aggregatedData[stock.sym] = {
                name: stock.name,
                data: hist.map(d => ({
                  date: d.date,
                  open: d.open,
                  high: d.high,
                  low: d.low,
                  close: d.close,
                  volume: d.volume
                }))
              };
            } else {
               failCount++;
            }
          } catch (err) {
             failCount++;
          }
        });

        await Promise.all(batchPromises);
        
        // Update state periodically so user sees progress
        if (i % 50 === 0) {
            setFetchedData({...aggregatedData});
        }
      }

      if (!cancelRef.current) {
        setProgress({ 
            cur: list.length, 
            total: list.length, 
            text: `🎉 下載完成！共取得 ${Object.keys(aggregatedData).length} 檔資料 (失敗 ${failCount} 檔)。` 
        });
      }
      
      setFetchedData(aggregatedData);

    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleStop = () => {
    cancelRef.current = true;
  };

  const handleDownloadFile = () => {
    if (Object.keys(fetchedData).length === 0) {
        alert("目前沒有資料可以下載！");
        return;
    }

    const dataStr = JSON.stringify(fetchedData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `taiwan_stock_history_1y_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="stock-strategy-container">
      <button className="back-btn" onClick={onBack}><span>←</span> 返回首頁</button>

      <div className="glass-card animate-in">
        <h2 className="section-title" style={{ marginBottom: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '1rem' }}>
          💾 台股歷史資料匯出中心
        </h2>
        
        <p style={{ color: '#94a3b8', fontSize: '1rem', lineHeight: '1.6', marginBottom: '2rem' }}>
          一鍵打包台股全市場（上市 + 上櫃，約 1,700 檔）近 <b style={{ color: '#818cf8' }}>1 年</b> 的日 K 線資料（開、高、低、收、成交量）。<br/>
          取得的資料將會整理成 <b style={{ color: '#10b981' }}>JSON 格式</b> 供您下載。<br/>
          <br/>
          ⚠️ 注意：全市場下載大約需要 <b style={{ color: '#f59e0b' }}>15 到 30 分鐘</b>。您可以隨時點擊「中斷」，並下載已經取得的部分資料。
        </p>

        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
          {!loading ? (
             <button 
                className="action-btn" 
                onClick={handleStartExport}
                style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)', padding: '14px 32px', fontSize: '1.1rem' }}
             >
                ▶️ 開始擷取全市場資料
             </button>
          ) : (
             <button 
                onClick={handleStop} 
                style={{ 
                    background: 'rgba(239,68,68,0.2)', 
                    border: '1px solid #ef4444', 
                    color: '#f87171', 
                    padding: '14px 32px', 
                    borderRadius: '12px', 
                    cursor: 'pointer',
                    fontSize: '1.1rem',
                    fontWeight: 'bold'
                }}
             >
                🛑 中斷擷取
             </button>
          )}

          {Object.keys(fetchedData).length > 0 && !loading && (
             <button 
                className="action-btn" 
                onClick={handleDownloadFile}
                style={{ background: 'linear-gradient(135deg, #10b981, #059669)', padding: '14px 32px', fontSize: '1.1rem' }}
             >
                📥 下載 JSON 檔案 ({Object.keys(fetchedData).length} 檔)
             </button>
          )}
        </div>

        {error && <div className="error-card" style={{ marginTop: '20px' }}>⚠️ {error}</div>}

        {(loading || progress.total > 0) && (
          <div style={{ marginTop: '24px', padding: '16px', background: 'rgba(0,0,0,0.3)', borderRadius: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', color: '#cbd5e1' }}>
                <span>{progress.text}</span>
                <span>{progress.total > 0 ? `${((progress.cur / progress.total) * 100).toFixed(1)}%` : ''}</span>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '8px', height: '10px', overflow: 'hidden' }}>
              <div style={{ 
                  background: 'linear-gradient(90deg, #3b82f6, #818cf8)', 
                  height: '100%', 
                  width: `${progress.total > 0 ? (progress.cur / progress.total) * 100 : 0}%`, 
                  transition: 'width 0.3s ease-out' 
                }} 
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
