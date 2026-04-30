/**
 * 斐波那契策略整合邏輯 (類型 + 資料抓取 + 回測運算)
 */

export interface IStockDataPoint {
  timestamp: number;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface IFiboStrategyResult {
  symbol: string;
  hasSignal: boolean;
  state: 'WAITING_ENTRY' | 'HOLDING';
  entry?: number;
  tp?: number;
  sl?: number;
  activeTrade?: {
    entryPrice: number;
    tp: number;
    sl: number;
    entryDate: string;
  };
  levels?: Record<string, number>;
  meta?: string;
}

export interface IBacktestTrade {
  entryDate: string;
  exitDate: string;
  entryPrice: number;
  exitPrice: number;
  tp: number;
  sl: number;
  isWin: boolean;
  profitPercent: number;
  rrRatio: number;
}

/**
 * 抓取歷史數據 (Yahoo 優先，FinMind 備援)
 */
export async function fetchYahooHistory(symbol: string, range: string = '1y'): Promise<IStockDataPoint[]> {
  const code = symbol.replace(/[^0-9]/g, '');
  const formattedSymbol = /^[0-9]+$/.test(symbol) ? `${symbol}.TW` : symbol;
  const url = `/api/yahoo/v8/finance/chart/${formattedSymbol}?range=${range}&interval=1d`;
  
  try {
    const response = await fetch(url);
    if (response.ok) {
      const json = await response.json();
      const result = json.chart.result?.[0];
      if (result && result.timestamp) {
        const { timestamp, indicators } = result;
        const quote = indicators.quote[0];
        const data = timestamp.map((ts: number, idx: number) => ({
          timestamp: ts * 1000,
          date: new Date(ts * 1000).toISOString().split('T')[0],
          open: quote.open[idx] || quote.close[idx] || 0,
          high: quote.high[idx] || quote.close[idx] || 0,
          low: quote.low[idx] || quote.close[idx] || 0,
          close: quote.close[idx] || 0,
          volume: quote.volume[idx] || 0,
        })).filter((d: any) => d.close > 0);

        if (data.length > 5) return data;
      }
    }
  } catch (e) {
    console.warn('[Fibo] Yahoo failed, falling back to FinMind...', e);
  }

  // --- FinMind 備援路徑 ---
  try {
    const thirtyDaysAgo = new Date();
    // 根據 range 決定天數
    const days = range === '1y' ? 365 : (range === '1mo' ? 30 : 90);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - days);
    const startDate = thirtyDaysAgo.toISOString().split('T')[0];
    
    const fRes = await fetch(`/api/finmind/api/v4/data?dataset=TaiwanStockPrice&stock_id=${code}&start_date=${startDate}`);
    if (fRes.ok) {
      const fJson = await fRes.json();
      if (fJson.data && fJson.data.length > 0) {
        return fJson.data.map((d: any) => ({
          timestamp: new Date(d.date).getTime(),
          date: d.date,
          open: d.open,
          high: d.max,
          low: d.min,
          close: d.close,
          volume: d.Trading_Volume,
        }));
      }
    }
  } catch (e) {
    console.error('[Fibo] All data sources failed', e);
  }

  throw new Error(`無法取得 ${symbol} 的歷史數據，請確認代號正確或稍後再試。`);
}

/**
 * 斐波那契策略運算 (包含狀態判斷)
 */
export function calculateFiboStrategy(
  symbol: string,
  data: IStockDataPoint[],
  window: number = 60,
  targetLevel: number = 0.236
): IFiboStrategyResult {
  if (data.length < window) return { symbol, hasSignal: false, state: 'WAITING_ENTRY' };

  // 先找出所有的斐波那契位階 (基於最後 window 天)
  const recentData = data.slice(-window);
  let swingHigh = Math.max(...recentData.map(d => d.high));
  let swingLow = Math.min(...recentData.map(d => d.low));
  const diff = swingHigh - swingLow;
  const ratios = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
  const levels: Record<string, number> = {};
  ratios.forEach(r => levels[r.toString()] = swingHigh - (diff * r));

  // --- 判斷目前是否在「持股中」 ---
  // 我們往回找最近一次的進場訊號，看看它是否已經出場
  let activeTrade: IFiboStrategyResult['activeTrade'] = undefined;
  
  // 為了精確，我們簡單模擬最後 30 天的情況
  for (let i = Math.max(window, data.length - 30); i < data.length; i++) {
    const currentDay = data[i];
    if (activeTrade) {
      if (currentDay.high >= activeTrade.tp || currentDay.low <= activeTrade.sl) {
        activeTrade = undefined; // 已出場
      }
    } else {
      const historicSlice = data.slice(0, i + 1);
      const signal = getRawSignal(historicSlice, window, targetLevel);
      if (signal.hasSignal) {
        activeTrade = {
          entryPrice: signal.entry!,
          tp: signal.tp!,
          sl: signal.sl!,
          entryDate: currentDay.date
        };
      }
    }
  }

  if (activeTrade) {
    return {
      symbol,
      hasSignal: false,
      state: 'HOLDING',
      activeTrade,
      levels
    };
  }

  // 如果不在持股中，檢查「今天」是否有新訊號
  const finalSignal = getRawSignal(data, window, targetLevel);
  return {
    symbol,
    ...finalSignal,
    state: finalSignal.hasSignal ? 'HOLDING' : 'WAITING_ENTRY',
    levels
  };
}

/**
 * 原始訊號判斷邏輯
 */
function getRawSignal(data: IStockDataPoint[], window: number, targetLevel: number) {
  if (data.length < window) return { hasSignal: false };
  const recentData = data.slice(-window);
  const swingHigh = Math.max(...recentData.map(d => d.high));
  const swingLow = Math.min(...recentData.map(d => d.low));
  const diff = swingHigh - swingLow;
  if (diff <= 0) return { hasSignal: false };

  const ratios = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
  const levels: Record<string, number> = {};
  ratios.forEach(r => levels[r.toString()] = swingHigh - (diff * r));

  const currentPrice = data[data.length - 1].close;
  const prevPrice = data[data.length - 2].close;
  const breakPrice = levels[targetLevel.toString()];

  if (prevPrice <= breakPrice && currentPrice > breakPrice) {
    const entry = currentPrice;
    const nextRatioIdx = ratios.indexOf(targetLevel) - 1;
    let tp = (nextRatioIdx >= 0) ? levels[ratios[nextRatioIdx].toString()] : entry * 1.1;
    const prevRatioIdx = ratios.indexOf(targetLevel) + 1;
    let sl = (prevRatioIdx < ratios.length) ? levels[ratios[prevRatioIdx].toString()] : entry * 0.95;

    return {
      hasSignal: true,
      entry,
      tp: parseFloat(tp.toFixed(2)),
      sl: parseFloat(sl.toFixed(2)),
    };
  }
  return { hasSignal: false };
}

/**
 * 執行回測
 */
export function runBacktest(
  symbol: string,
  data: IStockDataPoint[],
  strategyWindow: number = 60
) {
  const trades: IBacktestTrade[] = [];
  let activeTrade: { entryPrice: number; tp: number; sl: number; entryDate: string } | null = null;

  for (let i = strategyWindow; i < data.length; i++) {
    const currentDay = data[i];

    if (activeTrade) {
      const { tp, sl, entryPrice, entryDate } = activeTrade;
      let exitPrice: number | null = null;
      let isWin = false;

      if (currentDay.high >= tp) { 
        exitPrice = tp; 
        isWin = true; 
      } else if (currentDay.low <= sl) { 
        exitPrice = sl; 
        isWin = false; 
      }

      if (exitPrice !== null) {
        trades.push({
          entryDate,
          exitDate: currentDay.date,
          entryPrice,
          exitPrice,
          tp,
          sl,
          isWin,
          profitPercent: ((exitPrice - entryPrice) / entryPrice) * 100,
          rrRatio: Math.abs(tp - entryPrice) / Math.abs(entryPrice - sl) || 0
        });
        activeTrade = null;
      }
    } else {
      const historicSlice = data.slice(0, i + 1);
      const signal = getRawSignal(historicSlice, strategyWindow, 0.236);

      if (signal.hasSignal && signal.entry && signal.tp && signal.sl) {
        activeTrade = {
          entryPrice: signal.entry,
          tp: signal.tp,
          sl: signal.sl,
          entryDate: currentDay.date
        };
      }
    }
  }

  const winCount = trades.filter(t => t.isWin).length;
  const winRate = trades.length > 0 ? (winCount / trades.length) * 100 : 0;

  return {
    symbol,
    totalTrades: trades.length,
    winRate: `${winRate.toFixed(2)}%`,
    trades
  };
}
