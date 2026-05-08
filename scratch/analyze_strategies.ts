import fs from 'fs';
import path from 'path';

// Define the interface for data
interface DailyData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface StockData {
  name: string;
  data: DailyData[];
}

interface StrategyResult {
  name: string;
  trades: number;
  wins: number;
  totalReturn: number; // Cumulative percentage return
  maxWin: number;
  maxLoss: number;
}

const HOLDING_DAYS = 3;

// Helper: Calculate Simple Moving Average
function calcMA(data: number[], period: number): number[] {
  const result: number[] = new Array(data.length).fill(0);
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i];
    if (i >= period) {
      sum -= data[i - period];
      result[i] = sum / period;
    } else {
      result[i] = sum / (i + 1);
    }
  }
  return result;
}

// Helper: Calculate RSI (Simplified)
function calcRSI(data: number[], period: number = 14): number[] {
  const rsi: number[] = new Array(data.length).fill(0);
  let gains = 0;
  let losses = 0;

  for (let i = 1; i < data.length; i++) {
    const diff = data[i] - data[i - 1];
    
    if (i <= period) {
      if (diff > 0) gains += diff;
      else losses -= diff;
      
      if (i === period) {
        const avgGain = gains / period;
        const avgLoss = losses / period;
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        rsi[i] = 100 - (100 / (1 + rs));
      }
    } else {
      const prevDiff = data[i - period] - data[i - period - 1];
      // simplified smoothing (not Wilder's exact, but close enough for rough momentum)
      const currentGain = diff > 0 ? diff : 0;
      const currentLoss = diff < 0 ? -diff : 0;
      
      // Wilder's Smoothing: (PrevAvg * 13 + Current) / 14
      // We will just do a rolling sum for simplicity in this script
      gains = gains * ((period - 1)/period) + currentGain * (1/period);
      losses = losses * ((period - 1)/period) + currentLoss * (1/period);
      
      const rs = losses === 0 ? 100 : gains / losses;
      rsi[i] = 100 - (100 / (1 + rs));
    }
  }
  return rsi;
}

async function runAnalysis() {
  const filePath = path.join(process.cwd(), 'src', 'taiwan_stock_history_1y_2026-05-04.json');
  console.log(`Loading data from ${filePath}...`);
  
  if (!fs.existsSync(filePath)) {
    console.error('File not found!');
    process.exit(1);
  }

  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const allData: Record<string, StockData> = JSON.parse(fileContent);

  const stockSymbols = Object.keys(allData);
  console.log(`Successfully loaded ${stockSymbols.length} stocks.`);

  const strategies: Record<string, StrategyResult> = {
    'S1_RSI_Oversold': { name: 'RSI < 25 (極度超賣反彈)', trades: 0, wins: 0, totalReturn: 0, maxWin: 0, maxLoss: 0 },
    'S2_RSI_Momentum': { name: 'RSI > 75 (強勢動能追價)', trades: 0, wins: 0, totalReturn: 0, maxWin: 0, maxLoss: 0 },
    'S3_Vol_Breakout': { name: '成交量 > 2.5倍5日均量且收紅 (爆量起漲)', trades: 0, wins: 0, totalReturn: 0, maxWin: 0, maxLoss: 0 },
    'S4_Neg_Deviation': { name: '收盤價低於20MA > 10% (乖離過大)', trades: 0, wins: 0, totalReturn: 0, maxWin: 0, maxLoss: 0 },
    'S5_3_Black_Crows': { name: '連續3天收黑 (連三黑K抄底)', trades: 0, wins: 0, totalReturn: 0, maxWin: 0, maxLoss: 0 },
    'S6_MA_Cross':     { name: '5MA 向上突破 20MA (黃金交叉)', trades: 0, wins: 0, totalReturn: 0, maxWin: 0, maxLoss: 0 }
  };

  const executeTrade = (strategyKey: string, entryPrice: number, exitPrice: number) => {
    if (entryPrice <= 0) return;
    const r = ((exitPrice - entryPrice) / entryPrice) * 100;
    
    const st = strategies[strategyKey];
    st.trades++;
    if (r > 0) st.wins++;
    st.totalReturn += r;
    if (r > st.maxWin) st.maxWin = r;
    if (r < st.maxLoss) st.maxLoss = r;
  };

  // Run through each stock
  for (const sym of stockSymbols) {
    const stock = allData[sym];
    const data = stock.data;
    
    if (data.length < 30) continue; // Not enough data
    
    const closes = data.map(d => d.close);
    const volumes = data.map(d => d.volume);
    
    const ma5 = calcMA(closes, 5);
    const ma20 = calcMA(closes, 20);
    const volMa5 = calcMA(volumes, 5);
    const rsi14 = calcRSI(closes, 14);

    // We can only trade if we have enough days left to exit
    for (let i = 25; i < data.length - HOLDING_DAYS; i++) {
      const today = data[i];
      const exitDay = data[i + HOLDING_DAYS];
      
      const entryPrice = today.close;
      const exitPrice = exitDay.close;

      // Check S1: RSI Oversold
      if (rsi14[i] < 25 && rsi14[i-1] >= 25) {
        executeTrade('S1_RSI_Oversold', entryPrice, exitPrice);
      }

      // Check S2: RSI Momentum
      if (rsi14[i] > 75) {
        executeTrade('S2_RSI_Momentum', entryPrice, exitPrice);
      }

      // Check S3: Vol Breakout
      if (today.volume > volMa5[i-1] * 2.5 && today.close > today.open && today.close > data[i-1].close * 1.02) {
        executeTrade('S3_Vol_Breakout', entryPrice, exitPrice);
      }

      // Check S4: Negative Deviation
      const deviation = (today.close - ma20[i]) / ma20[i];
      if (deviation < -0.1) {
        executeTrade('S4_Neg_Deviation', entryPrice, exitPrice);
      }

      // Check S5: 3 Black Crows
      if (
        data[i].close < data[i].open && data[i].close < data[i-1].close &&
        data[i-1].close < data[i-1].open && data[i-1].close < data[i-2].close &&
        data[i-2].close < data[i-2].open
      ) {
        executeTrade('S5_3_Black_Crows', entryPrice, exitPrice);
      }

      // Check S6: MA Cross
      if (ma5[i] > ma20[i] && ma5[i-1] <= ma20[i-1]) {
        executeTrade('S6_MA_Cross', entryPrice, exitPrice);
      }
    }
  }

  // Print Report
  console.log('\n======================================================');
  console.log('   🔥 台股 3 日短線策略回測結果 (持有3天後賣出) 🔥   ');
  console.log('======================================================\n');
  
  const results = Object.values(strategies).map(s => {
    const winRate = s.trades > 0 ? ((s.wins / s.trades) * 100).toFixed(2) : '0.00';
    const avgReturn = s.trades > 0 ? (s.totalReturn / s.trades).toFixed(2) : '0.00';
    return {
      '策略名稱': s.name,
      '總交易次數': s.trades,
      '勝率 (%)': winRate,
      '平均單筆報酬 (%)': avgReturn,
      '單筆最大獲利 (%)': s.maxWin.toFixed(2),
      '單筆最大虧損 (%)': s.maxLoss.toFixed(2),
      _sortKey: s.trades > 50 ? parseFloat(avgReturn) : -999 // require minimum trades
    };
  });

  // Sort by average return
  results.sort((a, b) => b._sortKey - a._sortKey);

  console.table(results.map(r => {
    const { _sortKey, ...rest } = r;
    return rest;
  }));
  
  console.log('\n💡 備註：所有進出點皆假設以「觸發日收盤價」買進，並於「第 3 個交易日收盤價」賣出，未計算交易手續費與滑價。');
  console.log('💡 建議優先參考「總交易次數 > 100」且「平均報酬」最高的策略。\n');
}

runAnalysis().catch(console.error);
