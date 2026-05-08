import { useState } from 'react'
import WeatherApp from './WeatherApp'
import Home from './Home'
import GameApp from './GameApp'
import RhythmApp from './RhythmApp'
import SurvivorApp from './SurvivorApp'
import FluidCoreApp from './FluidCoreApp'
import ChronoShatterApp from './ChronoShatterApp'
import EtfApp from './EtfApp'
import StockScreenerApp from './StockScreenerApp'
import StockStrategyApp from './StockStrategyApp'
import DataExportApp from './DataExportApp'

export default function App() {
  const [currentView, setCurrentView] = useState<'home' | 'weather' | 'game' | 'rhythm' | 'survivor' | 'fluidcore' | 'chronoshatter' | 'etf' | 'screener' | 'fibo' | 'analysis' | 'radar' | 'export'>('home')

  return (
    <>
      {currentView === 'home' && (
        <Home onAppClick={(appId) => setCurrentView(appId as any)} />
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
      {currentView === 'fluidcore' && (
        <FluidCoreApp onBack={() => setCurrentView('home')} />
      )}
      {currentView === 'chronoshatter' && (
        <ChronoShatterApp onBack={() => setCurrentView('home')} />
      )}
      {currentView === 'etf' && (
        <EtfApp onBack={() => setCurrentView('home')} />
      )}
      {currentView === 'screener' && (
        <StockScreenerApp onBack={() => setCurrentView('home')} />
      )}
      {currentView === 'fibo' && (
        <StockStrategyApp onBack={() => setCurrentView('home')} initialTab="backtest" />
      )}
      {currentView === 'analysis' && (
        <StockStrategyApp onBack={() => setCurrentView('home')} initialTab="diagnosis" />
      )}
      {currentView === 'radar' && (
        <StockStrategyApp onBack={() => setCurrentView('home')} initialTab="radar" />
      )}
      {currentView === 'export' && (
        <DataExportApp onBack={() => setCurrentView('home')} />
      )}
    </>
  )
}
