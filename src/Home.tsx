//import React from 'react';

interface Props {
  onAppClick: (appId: string) => void;
}

const releaseVersion = "v2026.04.24.1640";

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

          {/* ETF App */}
          <div className="app-icon-wrapper" onClick={() => onAppClick('etf')}>
            <div className="app-icon" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', border: '2px solid #fcd34d', boxShadow: '0 0 10px #f59e0b' }}>
              <span className="icon-emoji">📈</span>
            </div>
            <span className="app-label" style={{ fontWeight: 'bold' }}>台股ETF</span>
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
