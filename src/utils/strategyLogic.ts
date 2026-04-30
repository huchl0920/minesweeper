/**
 * 通用策略回測邏輯核心
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

export type StrategyType = 'FIBO' | 'MA_CROSS' | 'RSI_OVERSOLD' | 'MACD_TREND';

export interface IStrategySignal {
  hasSignal: boolean;
  entry?: number;
  tp?: number;
  sl?: number;
  meta?: string;
}

export interface IStrategyResult {
  symbol: string;
  strategyName: string;
  hasSignal: boolean;
  state: 'WAITING_ENTRY' | 'HOLDING';
  activeTrade?: {
    entryPrice: number;
    tp: number;
    sl: number;
    entryDate: string;
  };
  levels?: Record<string, number>;
  indicators?: Record<string, any>;
}

// --- 技術指標計算 ---

export function getMA(data: number[], window: number): number[] {
  const ma: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < window - 1) {
      ma.push(0);
      continue;
    }
    const sum = data.slice(i - window + 1, i + 1).reduce((a, b) => a + b, 0);
    ma.push(sum / window);
  }
  return ma;
}

export function getRSI(data: number[], window: number = 14): number[] {
  const rsi: number[] = [];
  let gains = 0;
  let losses = 0;

  for (let i = 0; i < data.length; i++) {
    if (i === 0) {
      rsi.push(0);
      continue;
    }
    const diff = data[i] - data[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;

    if (i < window) {
      rsi.push(0);
    } else {
      if (i > window) {
        const prevDiff = data[i - 1] - data[i - 2];
        // 簡單移動平均平滑 (為了計算效率)
      }
      const avgGain = gains / window;
      const avgLoss = losses / window;
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      rsi.push(100 - (100 / (1 + rs)));
      
      // 重置計數 (滑動視窗)
      const oldestDiff = data[i - window + 1] - data[i - window];
      if (oldestDiff >= 0) gains -= oldestDiff;
      else losses += oldestDiff;
    }
  }
  return rsi;
}

// --- 策略信號判斷 ---

export function getStrategySignal(
  type: StrategyType, 
  data: IStockDataPoint[], 
  idx: number = -1
): IStrategySignal {
  const i = idx === -1 ? data.length - 1 : idx;
  if (i < 60) return { hasSignal: false };

  const prices = data.slice(0, i + 1).map(d => d.close);
  const current = data[i];
  
  switch (type) {
    case 'MA_CROSS': {
      const ma5 = getMA(prices, 5);
      const ma20 = getMA(prices, 20);
      const prev5 = ma5[i - 1];
      const prev20 = ma20[i - 1];
      const curr5 = ma5[i];
      const curr20 = ma20[i];

      if (prev5 <= prev20 && curr5 > curr20) {
        return { 
          hasSignal: true, 
          entry: curr5, 
          tp: curr5 * 1.1, 
          sl: curr20,
          meta: '5MA 金叉 20MA'
        };
      }
      break;
    }
    case 'RSI_OVERSOLD': {
      const rsi = getRSI(prices, 14);
      const currRsi = rsi[i];
      const prevRsi = rsi[i - 1];

      if (prevRsi < 30 && currRsi >= 30) {
        return { 
          hasSignal: true, 
          entry: current.close, 
          tp: current.close * 1.07, 
          sl: current.close * 0.94,
          meta: 'RSI 超賣區回升'
        };
      }
      break;
    }
    case 'FIBO': {
      // 復用原本的 Fibo 邏輯
      const window = 60;
      const recent = data.slice(i - window + 1, i + 1);
      const high = Math.max(...recent.map(d => d.high));
      const low = Math.min(...recent.map(d => d.low));
      const breakPrice = high - (high - low) * 0.236;
      const prevClose = data[i - 1].close;
      const currClose = data[i].close;

      if (prevClose <= breakPrice && currClose > breakPrice) {
        return { 
          hasSignal: true, 
          entry: currClose, 
          tp: high, 
          sl: high - (high - low) * 0.382,
          meta: '突破 0.236 強勢位'
        };
      }
      break;
    }
  }

  return { hasSignal: false };
}
