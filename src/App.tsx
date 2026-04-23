import { useState } from 'react'
import WeatherApp from './WeatherApp'
import Home from './Home'
import GameApp from './GameApp'
import RhythmApp from './RhythmApp'
import SurvivorApp from './SurvivorApp'

export default function App() {
  const [currentView, setCurrentView] = useState<'home' | 'weather' | 'game' | 'rhythm' | 'survivor'>('home')

  return (
    <>
      {currentView === 'home' && (
        <Home onAppClick={(appId) => setCurrentView(appId as 'home' | 'weather' | 'game' | 'rhythm' | 'survivor')} />
      )}
      {currentView === 'weather' && (
        <WeatherApp onBack={() => setCurrentView('home')} />
      )}
      {currentView === 'game' && (
        <GameApp onBack={() => setCurrentView('home')} />
      )}
      {currentView === 'rhythm' && (
        <RhythmApp onBack={() => setCurrentView('home')} />
      )}
      {currentView === 'survivor' && (
        <SurvivorApp onBack={() => setCurrentView('home')} />
      )}
    </>
  )
}
