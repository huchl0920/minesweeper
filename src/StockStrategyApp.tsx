import React, { useState } from 'react';
import './StockStrategyApp.css';
import { fetchYahooHistory } from './utils/fiboLogic';
import { getStrategySignal } from './utils/strategyLogic';
import type { StrategyType } from './utils/strategyLogic';
import type { IBacktestTrade, IFiboStrategyResult } from './utils/fiboLogic';

interface IBacktestResult {
  symbol: string;
  strategyName: string;
  winRate: string;
  totalTrades: number;
  trades: IBacktestTrade[];
  currentSignal: IFiboStrategyResult;
}

interface Props {
  onBack: () => void;
}

const STRATEGIES: { value: StrategyType; label: string }[] = [
  { value: 'FIBO', label: '斐波那契強勢突破' },
  { value: 'MA_CROSS', label: '均線黃金交叉 (5/20)' },
  { value: 'RSI_OVERSOLD', label: 'RSI 超賣反彈' },
];

const StockStrategyApp: React.FC<Props> = ({ onBack }) => {
  const [symbol, setSymbol] = useState('2330');
  const [strategyType, setStrategyType] = useState<StrategyType>('FIBO');
  const [backtest, setBacktest] = useState<IBacktestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRunBacktest = async () => {
    if (!symbol) return;
    
    setLoading(true);
    setError(null);
    try {
      const history = await fetchYahooHistory(symbol, '1y');
      
      if (history.length < 60) {
        throw new Error(`歷史數據不足 (僅 ${history.length} 天)，策略需要至少 60 天的資料才能運行。`);
      }

      const trades: IBacktestTrade[] = [];
      let activeTrade: any = null;

      for (let i = 60; i < history.length; i++) {
        const currentDay = history[i];
        if (activeTrade) {
          if (currentDay.high >= activeTrade.tp) {
            trades.push({ ...activeTrade, exitDate: currentDay.date, exitPrice: activeTrade.tp, isWin: true, profitPercent: ((activeTrade.tp - activeTrade.entryPrice) / activeTrade.entryPrice) * 100, rrRatio: 1 });
            activeTrade = null;
          } else if (currentDay.low <= activeTrade.sl) {
            trades.push({ ...activeTrade, exitDate: currentDay.date, exitPrice: activeTrade.sl, isWin: false, profitPercent: ((activeTrade.sl - activeTrade.entryPrice) / activeTrade.entryPrice) * 100, rrRatio: 1 });
            activeTrade = null;
          }
        } else {
          const sig = getStrategySignal(strategyType, history, i);
          if (sig.hasSignal && sig.entry && sig.tp && sig.sl) {
            activeTrade = { entryDate: currentDay.date, entryPrice: sig.entry, tp: sig.tp, sl: sig.sl };
          }
        }
      }

      const winCount = trades.filter(t => t.isWin).length;
      const winRate = trades.length > 0 ? (winCount / trades.length) * 100 : 0;
      const latestSig = getStrategySignal(strategyType, history);

      // 如果是 FIBO，額外計算 levels
      let levels: Record<string, number> | undefined = undefined;
      if (strategyType === 'FIBO') {
        const recent = history.slice(-60);
        const high = Math.max(...recent.map(d => d.high));
        const low = Math.min(...recent.map(d => d.low));
        const diff = high - low;
        levels = {
          '0.236': high - diff * 0.236,
          '0.382': high - diff * 0.382,
          '0.5': high - diff * 0.5,
          '0.618': high - diff * 0.618,
        };
      }

      setBacktest({
        symbol,
        strategyName: STRATEGIES.find(s => s.value === strategyType)?.label || '',
        winRate: `${winRate.toFixed(2)}%`,
        totalTrades: trades.length,
        trades: trades.reverse(),
        currentSignal: {
          symbol,
          hasSignal: latestSig.hasSignal,
          state: activeTrade ? 'HOLDING' : 'WAITING_ENTRY',
          activeTrade: activeTrade || undefined,
          meta: latestSig.meta,
          levels
        }
      });
    } catch (err: any) {
      console.error('Backtest error:', err);
      setError(err.message || '發生未知錯誤');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="stock-strategy-container">
      <button className="back-btn" onClick={onBack}>
        <span>←</span> 返回儀表板
      </button>

      <div className="glass-card animate-in">
        <div className="header-section">
          <div className="title-group">
            <h1>多策略回測系統</h1>
          </div>
          <div className="status-badge">
            ● Strategy Hub
          </div>
        </div>

        <div className="input-group">
          <div className="input-field-wrapper" style={{ flex: 1.5 }}>
            <span className="input-label">策略選擇</span>
            <select 
              value={strategyType}
              onChange={(e) => setStrategyType(e.target.value as StrategyType)}
              className="strategy-select"
            >
              {STRATEGIES.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          <div className="input-field-wrapper">
            <span className="input-label">股票代號</span>
            <input 
              type="text" 
              value={symbol} 
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder="代號"
              onKeyDown={(e) => e.key === 'Enter' && handleRunBacktest()}
            />
          </div>
          <button 
            className="action-btn"
            onClick={handleRunBacktest}
            disabled={loading}
          >
            {loading ? '運算中...' : '開始 1Y 回測'}
          </button>
        </div>
      </div>

      {error && (
        <div className="error-card animate-in">
          <span>⚠️</span> <strong>錯誤：</strong> {error}
        </div>
      )}

      {backtest && (
        <div className="animate-in" style={{ animationDelay: '0.1s' }}>
          {/* Top Row Stats Grid */}
          <div className="stat-grid">
            <div className="stat-box">
              <div className="stat-label">📈 歷史勝率</div>
              <div className="stat-value" style={{ color: '#10b981' }}>{backtest.winRate}</div>
            </div>
            <div className="stat-box">
              <div className="stat-label">📊 交易總次數</div>
              <div className="stat-value">{backtest.totalTrades}</div>
            </div>
            <div className="stat-box">
              <div className="stat-label">⏳ 觀測區間</div>
              <div className="stat-value" style={{ color: '#6366f1' }}>12 M</div>
            </div>
          </div>

          {/* Current Signal Section (More compact) */}
          <div className="glass-card" style={{ 
            borderLeft: backtest.currentSignal.state === 'HOLDING' ? '4px solid #10b981' : '4px solid #6366f1', 
            marginBottom: '2.5rem',
            position: 'relative',
            overflow: 'hidden',
            padding: '1.5rem 2rem'
          }}>
            <div style={{ 
              position: 'absolute', 
              top: '1rem', 
              right: '1.5rem', 
              fontSize: '0.65rem', 
              fontWeight: 800, 
              color: backtest.currentSignal.state === 'HOLDING' ? '#10b981' : '#6366f1',
              backgroundColor: backtest.currentSignal.state === 'HOLDING' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(99, 102, 241, 0.1)',
              padding: '0.2rem 0.6rem',
              borderRadius: '1rem',
              letterSpacing: '0.05em'
            }}>
              {backtest.currentSignal.state === 'HOLDING' ? 'HOLDING' : 'SCANNING'}
            </div>

            <h2 className="section-title" style={{ marginBottom: '1.25rem', fontSize: '1.25rem' }}>
              {backtest.currentSignal.state === 'HOLDING' ? (
                <><span>🏁</span> 當前狀態：等著退場 (持股中)</>
              ) : (
                <><span>🏹</span> 當前狀態：等著進場 (空手中)</>
              )}
            </h2>

            {backtest.currentSignal.state === 'HOLDING' ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '1rem' }}>
                <div>
                  <div className="stat-label">進場價格</div>
                  <div className="stat-value" style={{ fontSize: '1.5rem' }}>{backtest.currentSignal.activeTrade?.entryPrice?.toFixed(2) || '---'}</div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>{backtest.currentSignal.activeTrade?.entryDate}</div>
                </div>
                <div>
                  <div className="stat-label">止盈價格 (TP)</div>
                  <div className="stat-value" style={{ fontSize: '1.5rem', color: '#10b981' }}>{backtest.currentSignal.activeTrade?.tp?.toFixed(2) || '---'}</div>
                </div>
                <div>
                  <div className="stat-label">止損價格 (SL)</div>
                  <div className="stat-value" style={{ fontSize: '1.5rem', color: '#ef4444' }}>{backtest.currentSignal.activeTrade?.sl?.toFixed(2) || '---'}</div>
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '1rem' }}>
                {strategyType === 'FIBO' ? (
                  <>
                    <div>
                      <div className="stat-label">預計進場 (突破)</div>
                      <div className="stat-value" style={{ fontSize: '1.5rem', color: '#6366f1' }}>{backtest.currentSignal.levels?.['0.236']?.toFixed(2) || '---'}</div>
                    </div>
                    <div>
                      <div className="stat-label">23.6% 位階</div>
                      <div className="stat-value" style={{ fontSize: '1.5rem' }}>{backtest.currentSignal.levels?.['0.236']?.toFixed(2) || '---'}</div>
                    </div>
                    <div>
                      <div className="stat-label">38.2% 位階</div>
                      <div className="stat-value" style={{ fontSize: '1.5rem', color: 'var(--text-secondary)' }}>{backtest.currentSignal.levels?.['0.382']?.toFixed(2) || '---'}</div>
                    </div>
                  </>
                ) : (
                  <div>
                    <div className="stat-label">當前信號條件</div>
                    <div className="stat-value" style={{ fontSize: '1.5rem', color: '#6366f1' }}>
                      {backtest.currentSignal.meta || '正在掃描...'}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                      等待符合策略的買點出現
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <h2 className="section-title"><span>📋</span> 策略戰報日誌</h2>
          <div className="log-table-wrapper">
            <table className="log-table">
              <thead>
                <tr>
                  <th>結果</th>
                  <th>進場日期</th>
                  <th>進場價</th>
                  <th>出場日期</th>
                  <th>出場價</th>
                  <th>盈虧 %</th>
                </tr>
              </thead>
              <tbody>
                {backtest.trades.map((trade, idx) => (
                  <tr key={idx}>
                    <td>
                      <span className={`trade-badge ${trade.isWin ? 'win' : 'loss'}`}>
                        {trade.isWin ? 'WIN' : 'LOSS'}
                      </span>
                    </td>
                    <td className="date-text">{trade.entryDate}</td>
                    <td style={{ fontWeight: 700 }}>{trade.entryPrice?.toFixed(2) || '---'}</td>
                    <td className="date-text">{trade.exitDate}</td>
                    <td style={{ fontWeight: 700 }}>{trade.exitPrice?.toFixed(2) || '---'}</td>
                    <td className={trade.profitPercent >= 0 ? 'price-up' : 'price-down'}>
                      {trade.profitPercent > 0 ? '+' : ''}{trade.profitPercent?.toFixed(2) || '0.00'}%
                    </td>
                  </tr>
                ))}
                {backtest.trades.length === 0 && (
                  <tr>
                    <td colSpan={6} className="empty-state">
                      在此週期內無符合策略的交易訊號
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default StockStrategyApp;



