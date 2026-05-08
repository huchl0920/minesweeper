//import React from 'react';

interface Props {
  onAppClick: (appId: string) => void;
}

const releaseVersion = "v2026.04.30.1700";

export default function Home({ onAppClick }: Props) {
  // Current time display for a nice dashboard feel
  const now = new Date();
  const timeString = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  const dateString = `${now.getMonth() + 1}月${now.getDate()}日`;

  return (
    <div className="home-screen">
      <div className="home-bg" />
      <div className="home-container">
        <div className="home-header">
          <div className="home-time">{timeString}</div>
          <div className="home-date">{dateString}</div>
        </div>

        <div className="app-grid">
          {/* Weather App */}
          <div className="app-icon-wrapper" onClick={() => onAppClick('weather')}>
            <div className="app-icon weather-icon">
              <span className="icon-emoji">☁️</span>
            </div>
            <span className="app-label">天氣預報</span>
          </div>

          {/* Game */}
          <div className="app-icon-wrapper" onClick={() => onAppClick('game')}>
            <div className="app-icon game-icon">
              <span className="icon-emoji">🎮</span>
            </div>
            <span className="app-label">上樓梯</span>
          </div>

          {/* Rhythm */}
          <div className="app-icon-wrapper" onClick={() => onAppClick('rhythm')}>
            <div className="app-icon rhythm-icon">
              <span className="icon-emoji">🎵</span>
            </div>
            <span className="app-label">節奏大師</span>
          </div>

          {/* Survivor */}
          <div className="app-icon-wrapper" onClick={() => onAppClick('survivor')}>
            <div className="app-icon survivor-icon" style={{ background: 'linear-gradient(135deg, #10b981, #047857)' }}>
              <span className="icon-emoji">🔫</span>
            </div>
            <span className="app-label">霓虹生存戰</span>
          </div>

          {/* Fluid Core */}
          <div className="app-icon-wrapper" onClick={() => onAppClick('fluidcore')}>
            <div className="app-icon" style={{ background: 'linear-gradient(135deg, #0ea5e9, #0369a1)', border: '2px solid #38bdf8', boxShadow: '0 0 10px #0ea5e9' }}>
              <span className="icon-emoji">🌊</span>
            </div>
            <span className="app-label">流體力場</span>
          </div>

          {/* Chrono Shatter */}
          <div className="app-icon-wrapper" onClick={() => onAppClick('chronoshatter')}>
            <div className="app-icon" style={{ background: 'linear-gradient(135deg, #c084fc, #6b21a8)', border: '2px solid #d8b4fe', boxShadow: '0 0 10px #c084fc' }}>
              <span className="icon-emoji">🪞</span>
            </div>
            <span className="app-label">碎時空</span>
          </div>

          {/* ETF/Stock App */}
          <div className="app-icon-wrapper" onClick={() => onAppClick('etf')}>
            <div className="app-icon" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', border: '2px solid #fcd34d', boxShadow: '0 0 10px #f59e0b' }}>
              <span className="icon-emoji">📈</span>
            </div>
            <span className="app-label" style={{ fontWeight: 'bold' }}>台股</span>
          </div>

          {/* Stock Screener App */}
          <div className="app-icon-wrapper" onClick={() => onAppClick('screener')}>
            <div className="app-icon" style={{ background: 'linear-gradient(135deg, #06b6d4, #0891b2)', border: '2px solid #22d3ee', boxShadow: '0 0 10px #06b6d4' }}>
              <span className="icon-emoji">🔍</span>
            </div>
            <span className="app-label">智能選股</span>
          </div>

          {/* Fibo Backtest App */}
          <div className="app-icon-wrapper" onClick={() => onAppClick('fibo')}>
            <div className="app-icon" style={{ background: 'linear-gradient(135deg, #ec4899, #be185d)', border: '2px solid #f472b6', boxShadow: '0 0 10px #ec4899' }}>
              <span className="icon-emoji">🎯</span>
            </div>
            <span className="app-label">策略回測</span>
          </div>

          {/* Trade Analysis App */}
          <div className="app-icon-wrapper" onClick={() => onAppClick('analysis')}>
            <div className="app-icon" style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)', border: '2px solid #818cf8', boxShadow: '0 0 10px #6366f1' }}>
              <span className="icon-emoji">🩺</span>
            </div>
            <span className="app-label">交易診斷</span>
          </div>

          {/* Smart Radar App */}
          <div className="app-icon-wrapper" onClick={() => onAppClick('radar')}>
            <div className="app-icon" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', border: '2px solid #fbbf24', boxShadow: '0 0 10px #f59e0b' }}>
              <span className="icon-emoji">🎯</span>
            </div>
            <span className="app-label">智能雷達</span>
          </div>

          {/* Data Export App */}
          <div className="app-icon-wrapper" onClick={() => onAppClick('export')}>
            <div className="app-icon" style={{ background: 'linear-gradient(135deg, #10b981, #059669)', border: '2px solid #34d399', boxShadow: '0 0 10px #10b981' }}>
              <span className="icon-emoji">💾</span>
            </div>
            <span className="app-label">資料匯出</span>
          </div>
        </div>
        
        {/* Version Display */}
        <div style={{
          position: 'absolute',
          bottom: '20px',
          left: '0',
          right: '0',
          textAlign: 'center',
          color: '#475569',
          fontSize: '0.8rem',
          letterSpacing: '1px',
          pointerEvents: 'none'
        }}>
          VERSION {releaseVersion}
        </div>
      </div>
    </div>
  );
}
