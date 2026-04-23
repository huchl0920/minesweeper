//import React from 'react';

interface Props {
  onAppClick: (appId: string) => void;
}

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
        </div>
      </div>
    </div>
  );
}
