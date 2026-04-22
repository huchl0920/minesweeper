import { useState } from 'react'
import WeatherApp from './WeatherApp'
import Home from './Home'
import GameApp from './GameApp'

export default function App() {
  const [currentView, setCurrentView] = useState<'home' | 'weather' | 'game'>('home')

  return (
    <>
      {currentView === 'home' && (
        <Home onAppClick={(appId) => setCurrentView(appId as 'home' | 'weather' | 'game')} />
      )}
      {currentView === 'weather' && (
        <WeatherApp onBack={() => setCurrentView('home')} />
      )}
      {currentView === 'game' && (
        <GameApp onBack={() => setCurrentView('home')} />
      )}
    </>
  )
}
