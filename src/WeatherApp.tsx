import { useState, useEffect, useRef, useCallback } from 'react'
import './App.css'

// ── Types ──────────────────────────────────────────────
interface GeoResult {
  id: number; name: string; country: string; admin1?: string
  latitude: number; longitude: number; timezone: string
}

interface CurrentWeather {
  temperature: number; apparent_temperature: number
  relative_humidity: number; dew_point: number
  wind_speed: number; wind_direction: number
  uv_index: number; weather_code: number; is_day: number
  precipitation: number; surface_pressure: number; visibility: number
}

interface HourlyWeather {
  time: string[]; temperature_2m: number[]; weather_code: number[]
  precipitation_probability: number[]; is_day: number[]
}

interface DailyWeather {
  time: string[]; temperature_2m_max: number[]; temperature_2m_min: number[]
  weather_code: number[]; precipitation_probability_max: number[]
  sunrise: string[]; sunset: string[]
  precipitation_sum: number[]; wind_speed_10m_max: number[]
  wind_direction_10m_dominant: number[]; uv_index_max: number[]
}

// ── WMO helpers ────────────────────────────────────────
function getWeatherEmoji(code: number, isDay = 1): string {
  if (code === 0) return isDay ? '☀️' : '🌙'
  if (code <= 2) return isDay ? '⛅' : '🌙'
  if (code === 3) return '☁️'
  if (code <= 49) return '🌫️'
  if (code <= 59) return '🌦️'
  if (code <= 67) return '🌧️'
  if (code <= 69) return '🌨️'
  if (code <= 79) return '❄️'
  if (code <= 82) return '🌧️'
  if (code <= 84) return '🌨️'
  if (code <= 99) return '⛈️'
  return '🌡️'
}

function getWeatherDesc(code: number): string {
  if (code === 0) return '晴天'
  if (code === 1) return '大致晴朗'
  if (code === 2) return '部分多雲'
  if (code === 3) return '陰天'
  if (code <= 49) return '有霧'
  if (code <= 59) return '毛毛雨'
  if (code <= 67) return '降雨'
  if (code <= 69) return '凍雨'
  if (code <= 79) return '降雪'
  if (code <= 82) return '陣雨'
  if (code <= 84) return '陣雪'
  if (code <= 99) return '雷陣雨'
  return '未知'
}

function windDir(deg: number): string {
  const dirs = ['北','東北','東','東南','南','西南','西','西北']
  return dirs[Math.round(deg / 45) % 8]
}

function formatHour(timeStr: string): string {
  const d = new Date(timeStr)
  const h = d.getHours()
  return h === 0 ? '午夜' : h < 12 ? `上午${h}時` : h === 12 ? '中午' : `下午${h - 12}時`
}

function formatDayDate(timeStr: string): { day: string; date: string } {
  const d = new Date(timeStr)
  const days = ['週日','週一','週二','週三','週四','週五','週六']
  return {
    day: days[d.getDay()],
    date: `${d.getMonth() + 1}/${d.getDate()}`,
  }
}

function formatTime(timeStr: string): string {
  const d = new Date(timeStr)
  const h = d.getHours(), m = d.getMinutes()
  return `${h < 12 ? '上午' : '下午'}${h < 12 ? h : h - 12}:${m.toString().padStart(2, '0')}`
}

// ── API ────────────────────────────────────────────────
// 已廢除的行政區名稱，顯示時直接移除
const OBSOLETE_REGIONS = new Set(['臺灣省', '台灣省', 'Taiwan Province'])

async function searchCity(query: string): Promise<GeoResult[]> {
  const res = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=12&language=zh&format=json`
  )
  const raw: GeoResult[] = (await res.json()).results ?? []

  // 清理已廢除的 admin1，並去重（以 name + admin1 + country 為 key）
  const seen = new Set<string>()
  return raw
    .map(r => ({
      ...r,
      admin1: r.admin1 && OBSOLETE_REGIONS.has(r.admin1) ? undefined : r.admin1,
    }))
    .filter(r => {
      const key = `${r.name}|${r.admin1 ?? ''}|${r.country}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 6)
}


async function fetchWeather(lat: number, lon: number) {
  const url = [
    'https://api.open-meteo.com/v1/forecast?',
    `latitude=${lat}&longitude=${lon}`,
    '&current=temperature_2m,apparent_temperature,relative_humidity_2m,dew_point_2m,wind_speed_10m,wind_direction_10m,uv_index,weather_code,is_day,precipitation,surface_pressure,visibility',
    '&hourly=temperature_2m,weather_code,precipitation_probability,is_day',
    '&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max,sunrise,sunset,precipitation_sum,wind_speed_10m_max,wind_direction_10m_dominant,uv_index_max',
    '&timezone=auto&forecast_days=10',
  ].join('')
  const data = await (await fetch(url)).json()
  return {
    current: {
      temperature: data.current.temperature_2m,
      apparent_temperature: data.current.apparent_temperature,
      relative_humidity: data.current.relative_humidity_2m,
      dew_point: data.current.dew_point_2m,
      wind_speed: data.current.wind_speed_10m,
      wind_direction: data.current.wind_direction_10m,
      uv_index: data.current.uv_index,
      weather_code: data.current.weather_code,
      is_day: data.current.is_day,
      precipitation: data.current.precipitation,
      surface_pressure: data.current.surface_pressure,
      visibility: (data.current.visibility ?? 10000) / 1000,
    } as CurrentWeather,
    hourly: data.hourly as HourlyWeather,
    daily: data.daily as DailyWeather,
  }
}

// ── Main Component ─────────────────────────────────────
export default function WeatherApp({ onBack }: { onBack: () => void }) {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<GeoResult[]>([])
  const [location, setLocation] = useState<GeoResult | null>(null)
  const [current, setCurrent] = useState<CurrentWeather | null>(null)
  const [hourly, setHourly] = useState<HourlyWeather | null>(null)
  const [daily, setDaily] = useState<DailyWeather | null>(null)
  const [loading, setLoading] = useState(false)
  const [geoLoading, setGeoLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selectedDayIndex, setSelectedDayIndex] = useState(0)
  const searchRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node))
        setShowSuggestions(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const loadWeather = useCallback(async (geo: GeoResult) => {
    const cleanAdmin1 = geo.admin1 && OBSOLETE_REGIONS.has(geo.admin1) ? undefined : geo.admin1
    const cleanGeo = { ...geo, admin1: cleanAdmin1 }
    setLocation(cleanGeo)
    setShowSuggestions(false)
    setSuggestions([])
    const regionStr = [cleanAdmin1, geo.country].filter(Boolean).join(', ')
    setQuery(`${geo.name}${regionStr ? `, ${regionStr}` : ''}`)
    setLoading(true); setError(null)
    setSelectedDayIndex(0)
    try {
      const data = await fetchWeather(geo.latitude, geo.longitude)
      setCurrent(data.current); setHourly(data.hourly); setDaily(data.daily)
    } catch { setError('無法取得天氣資料，請稍後再試。') }
    finally { setLoading(false) }
  }, [])

  const handleQueryChange = (v: string) => {
    setQuery(v)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (v.trim().length < 2) { setSuggestions([]); setShowSuggestions(false); return }
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await searchCity(v)
        setSuggestions(results); setShowSuggestions(results.length > 0)
      } catch { /* ignore */ }
    }, 350)
  }

  const handleGPS = () => {
    if (!navigator.geolocation) { setError('瀏覽器不支援定位。'); return }
    setGeoLoading(true); setError(null)
    navigator.geolocation.getCurrentPosition(async pos => {
      const { latitude, longitude } = pos.coords
      try {
        const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=&latitude=${latitude}&longitude=${longitude}&count=1&language=zh&format=json`)
        const d = await res.json()
        const geo: GeoResult = d.results?.[0] ?? { id: 0, name: '目前位置', country: '', latitude, longitude, timezone: 'auto' }
        await loadWeather({ ...geo, latitude, longitude })
      } catch { await loadWeather({ id: 0, name: '目前位置', country: '', latitude, longitude, timezone: 'auto' }) }
      finally { setGeoLoading(false) }
    }, () => { setError('定位失敗，請確認已允許位置存取。'); setGeoLoading(false) })
  }

  // Hourly: next 24h sliced, display 5 at a time
  const hourlySlice = hourly ? (() => {
    const now = new Date()
    const idx = Math.max(0, hourly.time.findIndex(t => new Date(t) >= now))
    return {
      time: hourly.time.slice(idx, idx + 24),
      temperature_2m: hourly.temperature_2m.slice(idx, idx + 24),
      weather_code: hourly.weather_code.slice(idx, idx + 24),
      precipitation_probability: hourly.precipitation_probability.slice(idx, idx + 24),
      is_day: hourly.is_day.slice(idx, idx + 24),
    }
  })() : null



  return (
    <div className="weather-app">
      {/* City silhouette BG */}
      <div className="bg-layer" />

      <div className="app-container">
        {/* Header / Search */}
        <div className="weather-header">
          <button className="back-btn" onClick={onBack} aria-label="返回首頁">
            ‹ 
          </button>
          <div className="search-wrapper" ref={searchRef} style={{ flex: 1 }}>
            <div className="search-bar">
              <span className="search-icon">🔍</span>
            <input
              type="text" className="search-input"
              placeholder="搜尋城市…" value={query}
              onChange={e => handleQueryChange(e.target.value)}
              onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            />
            <button
              className={`gps-btn ${geoLoading ? 'spinning' : ''}`}
              onClick={handleGPS} title="目前位置" aria-label="目前位置"
            >
              📍
            </button>
          </div>
          {showSuggestions && (
            <ul className="suggestions">
              {suggestions.map(s => (
                <li key={s.id} className="suggestion-item" onClick={() => loadWeather(s)}>
                  <span className="sug-city">{s.name}</span>
                  <span className="sug-region">{[s.admin1, s.country].filter(Boolean).join(', ')}</span>
                </li>
              ))}
            </ul>
          )}
          </div>
        </div>

        {error && <div className="error-msg">⚠️ {error}</div>}

        {loading && (
          <div className="loading-state">
            <div className="loader" />
            <p>載入中…</p>
          </div>
        )}

        {!loading && !current && !error && (
          <div className="empty-state">
            <div className="empty-icon">🌍</div>
            <h2>查詢您所在地的天氣</h2>
            <p>在上方搜尋城市，或點擊 📍 使用目前位置</p>
          </div>
        )}

        {!loading && current && location && daily && (
          <>
            {/* ── Hero ── */}
            {(() => {
              const hIcon = selectedDayIndex === 0 
                ? getWeatherEmoji(current.weather_code, current.is_day) 
                : getWeatherEmoji(daily.weather_code[selectedDayIndex])
              const hDesc = selectedDayIndex === 0 
                ? getWeatherDesc(current.weather_code) 
                : getWeatherDesc(daily.weather_code[selectedDayIndex])
              const hTemp = selectedDayIndex === 0 
                ? Math.round(current.temperature) 
                : Math.round(daily.temperature_2m_max[selectedDayIndex])
              
              return (
                <div className="hero-card">
                  <div className="hero-location">{location.name}{location.admin1 ? `, ${location.admin1}` : ''}</div>
                  <div className="hero-weather-label">
                    <span className="hero-icon">{hIcon}</span>
                    {hDesc}
                  </div>
                  <div className="hero-temp">{hTemp}<span className="hero-deg">°</span></div>
                  {selectedDayIndex === 0 && (
                    <div className="hero-sub">體感溫度：{Math.round(current.apparent_temperature)}°</div>
                  )}
                  <div className="hero-range">
                    最高溫：{Math.round(daily.temperature_2m_max[selectedDayIndex])}° · 最低溫：{Math.round(daily.temperature_2m_min[selectedDayIndex])}°
                  </div>
                </div>
              )
            })()}

            {/* ── Hourly ── */}
            {hourlySlice && (
              <div className="dark-card">
                <div className="card-header">
                  <span className="card-title">🕐 每小時天氣預報</span>
                </div>
                <div className="hourly-grid">
                  {hourlySlice.time.map((t, idx) => {
                    return (
                      <div key={t} className="hourly-col">
                        <div className="h-temp">{Math.round(hourlySlice.temperature_2m[idx])}°</div>
                        <div className="h-emoji">{getWeatherEmoji(hourlySlice.weather_code[idx], hourlySlice.is_day[idx])}</div>
                        <div className="h-rain">{hourlySlice.precipitation_probability[idx]}%</div>
                        <div className="h-time">{idx === 0 ? '現在' : formatHour(t)}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── 10-day ── */}
            <div className="dark-card">
              <div className="card-header">
                <span className="card-title">📅 未來 10 天的天氣預報</span>
              </div>
              <div className="daily-grid">
                {daily.time.map((t, idx) => {
                  const { day, date } = formatDayDate(t)
                  return (
                    <div 
                      key={t} 
                      className={`daily-col ${idx === selectedDayIndex ? 'selected' : ''}`}
                      onClick={() => setSelectedDayIndex(idx)}
                      role="button"
                    >
                      <div className="d-max">{Math.round(daily.temperature_2m_max[idx])}°</div>
                      <div className="d-min">{Math.round(daily.temperature_2m_min[idx])}°</div>
                      <div className="d-emoji">{getWeatherEmoji(daily.weather_code[idx])}</div>
                      {daily.precipitation_probability_max[idx] > 0 && (
                        <div className="d-rain">{daily.precipitation_probability_max[idx]}%</div>
                      )}
                      <div className="d-day">{idx === 0 ? '今天' : day}</div>
                      <div className="d-date">{date}</div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* ── Detail 2-col grid ── */}
            {(() => {
              const displayPrecip = selectedDayIndex === 0 ? current.precipitation : daily.precipitation_sum[selectedDayIndex]
              const displayWind = selectedDayIndex === 0 ? current.wind_speed : daily.wind_speed_10m_max[selectedDayIndex]
              const displayWindDirDeg = selectedDayIndex === 0 ? current.wind_direction : daily.wind_direction_10m_dominant[selectedDayIndex]
              const displayUV = selectedDayIndex === 0 ? current.uv_index : daily.uv_index_max[selectedDayIndex]
              const displaySunrise = formatTime(daily.sunrise[selectedDayIndex])
              const displaySunset = formatTime(daily.sunset[selectedDayIndex])

              return (
                <div className="detail-grid">
                  {/* Precipitation */}
                  <div className="dark-card detail-card">
                    <div className="dc-title">🌧️ 降水</div>
                    <div className="dc-big">{displayPrecip.toFixed(1)}<span className="dc-unit">公釐</span></div>
                    <div className="dc-sub">{selectedDayIndex === 0 ? '本日總降雨量' : '預測總降雨量'}</div>
                  </div>

                  {/* Wind */}
                  <div className="dark-card detail-card detail-card--circle">
                    <div className="dc-title">🌬️ 風</div>
                    <div className="dc-big">{Math.round(displayWind)}<span className="dc-unit">公里/小時</span></div>
                    <div className="dc-sub">風向：{windDir(displayWindDirDeg)}</div>
                  </div>

                  {/* Sunrise / Sunset */}
                  <div className="dark-card detail-card">
                    <div className="dc-title">🌅 日出和日落</div>
                    <div className="sunrise-arc">
                      <div className="arc-track">
                        <div className="arc-sun" />
                      </div>
                    </div>
                    <div className="sunrise-row">
                      <span>🌅 {displaySunrise}</span>
                      <span>🌇 {displaySunset}</span>
                    </div>
                  </div>

                  {/* UV */}
                  <div className="dark-card detail-card detail-card--circle">
                    <div className="dc-title">☀️ 紫外線指數</div>
                    <div className="dc-big">{Math.round(displayUV)}</div>
                    <div className={`uv-badge ${displayUV <= 2 ? 'uv-low' : displayUV <= 5 ? 'uv-mid' : 'uv-high'}`}>
                      {displayUV <= 2 ? '低量級' : displayUV <= 5 ? '中量級' : '高量級'}
                    </div>
                  </div>

                  {/* Following metrics are only available for current conditions */}
                  {selectedDayIndex === 0 && (
                    <>
                      {/* Humidity */}
                      <div className="dark-card detail-card">
                        <div className="dc-title">💧 濕度</div>
                        <div className="dc-big">{current.relative_humidity}<span className="dc-unit">%</span></div>
                        <div className="humidity-bar-wrap">
                          <div className="humidity-bar" style={{ width: `${current.relative_humidity}%` }} />
                        </div>
                        <div className="dc-sub">{Math.round(current.dew_point)}° 露點</div>
                      </div>

                      {/* Pressure */}
                      <div className="dark-card detail-card detail-card--circle">
                        <div className="dc-title">⊕ 氣压</div>
                        <div className="dc-big">{Math.round(current.surface_pressure)}<span className="dc-unit">百帕</span></div>
                        <div className="pressure-gauge">
                          <svg viewBox="0 0 80 45" className="gauge-svg">
                            <path d="M5,40 A35,35 0 0,1 75,40" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="6" strokeLinecap="round"/>
                            <path d="M5,40 A35,35 0 0,1 75,40" fill="none" stroke="white" strokeWidth="6" strokeLinecap="round"
                              strokeDasharray="110" strokeDashoffset={110 - Math.min(110, ((current.surface_pressure - 950) / 80) * 110)} />
                          </svg>
                        </div>
                      </div>

                      {/* Visibility */}
                      <div className="dark-card detail-card detail-card--circle">
                        <div className="dc-title">👁️ 能見度</div>
                        <div className="dc-big">{Math.round(current.visibility)}<span className="dc-unit">公里</span></div>
                      </div>

                      {/* Wind speed detail compass */}
                      <div className="dark-card detail-card">
                        <div className="dc-title">🧭 風向</div>
                        <div className="compass-wrap">
                          <div className="compass">
                            <div className="compass-needle" style={{ transform: `rotate(${current.wind_direction}deg)` }} />
                            <span className="compass-n">N</span>
                          </div>
                        </div>
                        <div className="dc-sub">{windDir(current.wind_direction)}風 {Math.round(current.wind_speed)} km/h</div>
                      </div>
                    </>
                  )}
                </div>
              )
            })()}

            <div className="data-source">資料來源：Open-Meteo</div>
          </>
        )}
      </div>
    </div>
  )
}
