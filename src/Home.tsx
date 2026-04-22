

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
            <span className="app-label">小遊戲</span>
          </div>
        </div>
      </div>
    </div>
  );
}
