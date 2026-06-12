import { useState, useEffect, useCallback, useRef } from 'react';
import './GuestbookApp.css';

interface Message {
  id: string;
  nickname: string;
  avatar: string;
  content: string;
  timestamp: number;
}

interface Props {
  onBack: () => void;
}

type StorageMode = 'public-kv' | 'firebase' | 'supabase';

const DEFAULT_BOARD_KEY = 'bzhuo44r'; // 預設的公共留言板金鑰
const REFRESH_INTERVAL = 10; // 自動同步間隔秒數

// 輔助函式：將字串轉為 Hex，避免 ASP.NET 路由中的特殊字元限制
const stringToHex = (str: string): string => {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
};

// 輔助函式：將 Hex 轉回字串
const hexToString = (hex: string): string => {
  if (!hex) return '';
  const cleanHex = hex.replace(/^"|"$/g, '').trim();
  if (cleanHex === 'None' || cleanHex === 'null' || !cleanHex) {
    return '';
  }
  try {
    const matches = cleanHex.match(/.{1,2}/g);
    if (!matches) return '';
    const bytes = new Uint8Array(matches.map(val => parseInt(val, 16)));
    const decoder = new TextDecoder();
    return decoder.decode(bytes);
  } catch (e) {
    console.error('Hex 解碼失敗:', e, cleanHex);
    return '';
  }
};

export default function GuestbookApp({ onBack }: Props) {
  // 暱稱與頭像
  const [nickname, setNickname] = useState(() => localStorage.getItem('gb_nickname') || '路過的小雞');
  const [avatar, setAvatar] = useState(() => localStorage.getItem('gb_avatar') || '🐤');
  
  // 留言板設定
  const [storageMode, setStorageMode] = useState<StorageMode>(
    () => (localStorage.getItem('gb_storage_mode') as StorageMode) || 'public-kv'
  );
  const [boardKey, setBoardKey] = useState(() => localStorage.getItem('gb_board_key') || DEFAULT_BOARD_KEY);
  
  // 留言資料與輸入
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputContent, setInputContent] = useState('');
  
  // 狀態控制
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL);

  // 暫存的金鑰輸入與私有資料庫設定
  const [inputKey, setInputKey] = useState('');
  const [firebaseUrl, setFirebaseUrl] = useState(() => localStorage.getItem('gb_firebase_url') || '');
  const [supabaseUrl, setSupabaseUrl] = useState(() => localStorage.getItem('gb_supabase_url') || '');
  const [supabaseKey, setSupabaseKey] = useState(() => localStorage.getItem('gb_supabase_key') || '');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const countdownTimer = useRef<any>(null);

  // 頭像清單
  const avatarList = ['🐤', '🦊', '🐱', '🐻', '🐼', '🤖', '👻', '🚀', '💡', '🎮', '🍕', '🌸', '😎', '🦄', '🦖'];

  // 儲存設定到 localStorage
  useEffect(() => {
    localStorage.setItem('gb_nickname', nickname);
  }, [nickname]);

  useEffect(() => {
    localStorage.setItem('gb_avatar', avatar);
  }, [avatar]);

  useEffect(() => {
    localStorage.setItem('gb_storage_mode', storageMode);
  }, [storageMode]);

  useEffect(() => {
    localStorage.setItem('gb_board_key', boardKey);
  }, [boardKey]);

  useEffect(() => {
    localStorage.setItem('gb_firebase_url', firebaseUrl);
  }, [firebaseUrl]);

  useEffect(() => {
    localStorage.setItem('gb_supabase_url', supabaseUrl);
  }, [supabaseUrl]);

  useEffect(() => {
    localStorage.setItem('gb_supabase_key', supabaseKey);
  }, [supabaseKey]);

  // 滑動到最底部
  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  // ----------------------------------------------------
  // API 串接邏輯
  // ----------------------------------------------------

  // 1. KeyValue.immanuel.co API 呼叫
  const fetchPublicKV = useCallback(async (key: string): Promise<string> => {
    const res = await fetch(`/api/keyval/GetValue/${boardKey}/${key}`, {
      headers: {
        'Accept': 'application/json'
      }
    });
    if (!res.ok) throw new Error(`讀取公共資料庫失敗 (${res.status})`);
    const data = await res.text();
    return data;
  }, [boardKey]);

  const updatePublicKV = useCallback(async (key: string, value: string): Promise<boolean> => {
    const res = await fetch(`/api/keyval/UpdateValue/${boardKey}/${key}/${value}`, {
      method: 'POST'
    });
    if (!res.ok) throw new Error(`寫入公共資料庫失敗 (${res.status})`);
    const data = await res.text();
    return data === 'true';
  }, [boardKey]);

  // 2. 獲取留言列表
  const loadMessages = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setErrorMsg('');
    try {
      if (storageMode === 'public-kv') {
        // 先讀取 index 鍵值，取得留言的 id 列表
        const indexHex = await fetchPublicKV('index');
        const indexStr = hexToString(indexHex);
        
        if (!indexStr) {
          setMessages([]);
          setLoading(false);
          return;
        }

        const ids = indexStr.split(',').filter(Boolean);
        // 平行載入所有留言詳細內容
        const promises = ids.map(async (id) => {
          try {
            const msgHex = await fetchPublicKV(id);
            const msgStr = hexToString(msgHex);
            if (!msgStr) return null;
            return JSON.parse(msgStr) as Message;
          } catch (e) {
            console.error(`讀取留言 ${id} 失敗:`, e);
            return null;
          }
        });

        const results = await Promise.all(promises);
        const validMessages = results.filter((m): m is Message => m !== null);
        // 依照時間排序
        validMessages.sort((a, b) => a.timestamp - b.timestamp);
        setMessages(validMessages);
      } 
      else if (storageMode === 'firebase') {
        if (!firebaseUrl) {
          throw new Error('未設定 Firebase Realtime Database URL');
        }
        // 清理 URL
        let cleanUrl = firebaseUrl.trim();
        if (!cleanUrl.endsWith('.json')) {
          cleanUrl = cleanUrl.replace(/\/$/, '') + `/guestbook/${boardKey}.json`;
        }
        
        const res = await fetch(cleanUrl);
        if (!res.ok) throw new Error(`Firebase 讀取失敗 (${res.status})`);
        const data = await res.json();
        
        if (!data) {
          setMessages([]);
          setLoading(false);
          return;
        }

        // Firebase 返回的是以 id 為 key 的物件
        const list: Message[] = Object.keys(data).map(key => ({
          ...data[key],
          id: key
        }));
        list.sort((a, b) => a.timestamp - b.timestamp);
        setMessages(list);
      } 
      else if (storageMode === 'supabase') {
        if (!supabaseUrl || !supabaseKey) {
          throw new Error('未設定 Supabase URL 或 Anon Key');
        }
        
        const cleanUrl = supabaseUrl.trim().replace(/\/$/, '') + '/rest/v1/guestbook';
        const res = await fetch(`${cleanUrl}?board_key=eq.${boardKey}&order=timestamp.asc`, {
          method: 'GET',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`
          }
        });
        
        if (!res.ok) throw new Error(`Supabase 讀取失敗 (${res.status})`);
        const data = await res.json();
        setMessages(data || []);
      }
    } catch (e: any) {
      console.error('載入留言失敗:', e);
      setErrorMsg(e.message || '連線錯誤，無法載入留言');
    } finally {
      setLoading(false);
    }
  }, [storageMode, boardKey, fetchPublicKV, firebaseUrl, supabaseUrl, supabaseKey]);

  // 3. 發送新留言
  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputContent.trim()) return;
    
    setSending(true);
    setErrorMsg('');
    
    const msgId = `msg_${Date.now()}`;
    const newMsg: Message = {
      id: msgId,
      nickname: nickname.trim() || '匿名的神秘客',
      avatar: avatar,
      content: inputContent.trim(),
      timestamp: Date.now()
    };

    try {
      if (storageMode === 'public-kv') {
        // a. 先寫入留言本體
        const msgHex = stringToHex(JSON.stringify(newMsg));
        await updatePublicKV(msgId, msgHex);

        // b. 讀取目前的 index
        const indexHex = await fetchPublicKV('index');
        const indexStr = hexToString(indexHex);
        
        let newIndexStr = '';
        if (!indexStr) {
          newIndexStr = msgId;
        } else {
          const ids = indexStr.split(',').filter(Boolean);
          // 限制只保留最新 50 條留言索引，避免超過 index 鍵的長度限制 (1024 bytes)
          if (ids.length >= 50) {
            ids.shift();
          }
          ids.push(msgId);
          newIndexStr = ids.join(',');
        }

        // c. 更新 index
        const newIndexHex = stringToHex(newIndexStr);
        await updatePublicKV('index', newIndexHex);
      } 
      else if (storageMode === 'firebase') {
        let cleanUrl = firebaseUrl.trim();
        if (!cleanUrl.endsWith('.json')) {
          cleanUrl = cleanUrl.replace(/\/$/, '') + `/guestbook/${boardKey}/${msgId}.json`;
        } else {
          // 如果填寫的是完整的 json 結尾，需要解析並替換成指定路徑
          cleanUrl = cleanUrl.replace('.json', `/guestbook/${boardKey}/${msgId}.json`);
        }
        
        const res = await fetch(cleanUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(newMsg)
        });
        if (!res.ok) throw new Error(`Firebase 儲存失敗 (${res.status})`);
      } 
      else if (storageMode === 'supabase') {
        const cleanUrl = supabaseUrl.trim().replace(/\/$/, '') + '/rest/v1/guestbook';
        const res = await fetch(cleanUrl, {
          method: 'POST',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
          },
          body: JSON.stringify({
            id: msgId,
            board_key: boardKey,
            nickname: newMsg.nickname,
            avatar: newMsg.avatar,
            content: newMsg.content,
            timestamp: newMsg.timestamp
          })
        });
        if (!res.ok) throw new Error(`Supabase 儲存失敗 (${res.status})`);
      }

      setInputContent('');
      // 成功後立即刷新列表並滾動到底部
      await loadMessages(true);
      setTimeout(() => scrollToBottom(), 100);
      setCountdown(REFRESH_INTERVAL); // 重置倒數
    } catch (e: any) {
      console.error('發送留言失敗:', e);
      setErrorMsg(e.message || '發送失敗，請重試');
    } finally {
      setSending(false);
    }
  };

  // 建立新看板金鑰
  const createNewBoard = async () => {
    if (!window.confirm('確定要建立新的看板嗎？您將會取得一個全新的空白金鑰。')) return;
    setLoading(true);
    try {
      const res = await fetch('/api/keyval/GetAppKey');
      if (!res.ok) throw new Error('索取金鑰失敗');
      const newKey = (await res.text()).replace(/^"|"$/g, '').trim();
      if (newKey) {
        setBoardKey(newKey);
        setStorageMode('public-kv');
        setShowSettings(false);
        alert(`已建立新看板！您的新金鑰為: ${newKey}\n請分享此金鑰給其他裝置以同步留言。`);
      }
    } catch (e: any) {
      alert(`建立看板失敗: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 加入已有看板
  const joinBoard = () => {
    const cleanKey = inputKey.trim().toLowerCase();
    if (!cleanKey) return;
    if (cleanKey.length !== 8) {
      alert('看板金鑰格式應為 8 碼英數字！');
      return;
    }
    setBoardKey(cleanKey);
    setInputKey('');
    setShowSettings(false);
  };

  // 複製金鑰
  const copyBoardKey = () => {
    navigator.clipboard.writeText(boardKey);
    alert('已複製看板金鑰至剪貼簿！');
  };

  // 初始化載入
  useEffect(() => {
    loadMessages();
    setTimeout(() => scrollToBottom('auto'), 400);
  }, [loadMessages]);

  // 自動同步定時器
  useEffect(() => {
    if (countdownTimer.current) clearInterval(countdownTimer.current);

    countdownTimer.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          loadMessages(true);
          return REFRESH_INTERVAL;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (countdownTimer.current) clearInterval(countdownTimer.current);
    };
  }, [loadMessages]);

  return (
    <div className="guestbook-app">
      {/* 炫彩背景 */}
      <div className="gb-bg-glow glow-1" />
      <div className="gb-bg-glow glow-2" />

      {/* 頂部導覽列 */}
      <header className="gb-header">
        <button className="gb-back-btn" onClick={onBack}>
          ← 返回選單
        </button>
        <h1 className="gb-title">💬 線上即時留言板</h1>
        <button className="gb-settings-btn" onClick={() => setShowSettings(!showSettings)}>
          ⚙️ 看板設定
        </button>
      </header>

      {/* 看板設定浮動面板 */}
      {showSettings && (
        <div className="gb-modal-backdrop" onClick={() => setShowSettings(false)}>
          <div className="gb-modal" onClick={e => e.stopPropagation()}>
            <div className="gb-modal-header">
              <h2>⚙️ 留言板同步設定</h2>
              <button className="gb-close-modal" onClick={() => setShowSettings(false)}>×</button>
            </div>
            
            <div className="gb-modal-body">
              {/* 看板分享 */}
              <section className="gb-setting-section">
                <h3>👥 跨端同步金鑰</h3>
                <p className="setting-desc">在其他裝置打開此網頁並輸入本金鑰，即可同步看見所有留言。</p>
                <div className="gb-key-display">
                  <span>金鑰：<strong>{boardKey}</strong></span>
                  <button className="gb-copy-btn" onClick={copyBoardKey}>複製金鑰</button>
                </div>

                <div className="gb-key-actions">
                  <div className="join-box">
                    <input 
                      type="text" 
                      placeholder="輸入 8 碼金鑰" 
                      value={inputKey} 
                      onChange={e => setInputKey(e.target.value)}
                      maxLength={8}
                    />
                    <button onClick={joinBoard}>載入看板</button>
                  </div>
                  <button className="gb-new-board-btn" onClick={createNewBoard}>➕ 建立全新看板</button>
                </div>
              </section>

              {/* 儲存模式切換 */}
              <section className="gb-setting-section">
                <h3>💾 資料庫儲存模式</h3>
                <div className="storage-mode-selector">
                  <button 
                    className={storageMode === 'public-kv' ? 'active' : ''} 
                    onClick={() => setStorageMode('public-kv')}
                  >
                    免費公共通道
                  </button>
                  <button 
                    className={storageMode === 'firebase' ? 'active' : ''} 
                    onClick={() => setStorageMode('firebase')}
                  >
                    自訂 Firebase
                  </button>
                  <button 
                    className={storageMode === 'supabase' ? 'active' : ''} 
                    onClick={() => setStorageMode('supabase')}
                  >
                    自訂 Supabase
                  </button>
                </div>

                {storageMode === 'public-kv' && (
                  <div className="mode-info success">
                    <p>💡 <strong>說明</strong>：使用免費匿名的 KeyValue API。免註冊帳號，適合快速測試與公開交流。留言上限最新 50 條。</p>
                  </div>
                )}

                {storageMode === 'firebase' && (
                  <div className="mode-config">
                    <p className="mode-info warning">⚠️ <strong>說明</strong>：需自備 Firebase Realtime Database，請在下方輸入連線網址（無防護模式或附帶認證）。</p>
                    <label>Firebase Realtime Database URL:</label>
                    <input 
                      type="text" 
                      placeholder="https://your-app-default-rtdb.firebaseio.com" 
                      value={firebaseUrl}
                      onChange={e => setFirebaseUrl(e.target.value)}
                    />
                  </div>
                )}

                {storageMode === 'supabase' && (
                  <div className="mode-config">
                    <p className="mode-info warning">⚠️ <strong>說明</strong>：需在 Supabase 建立 `guestbook` 資料表（欄位包含: id, board_key, nickname, avatar, content, timestamp）。</p>
                    <label>Supabase URL:</label>
                    <input 
                      type="text" 
                      placeholder="https://your-supabase-project.supabase.co" 
                      value={supabaseUrl}
                      onChange={e => setSupabaseUrl(e.target.value)}
                    />
                    <label>Supabase Anon Key:</label>
                    <input 
                      type="password" 
                      placeholder="eyJhbGciOi..." 
                      value={supabaseKey}
                      onChange={e => setSupabaseKey(e.target.value)}
                    />
                  </div>
                )}
              </section>
            </div>
            
            <div className="gb-modal-footer">
              <button className="gb-save-btn" onClick={() => setShowSettings(false)}>確認並返回</button>
            </div>
          </div>
        </div>
      )}

      {/* 主要內容區 */}
      <main className="gb-main-container">
        {/* 左側：個人化與看板狀態 */}
        <section className="gb-left-panel">
          <div className="gb-card user-profile-card">
            <h3>👤 我的發言設定</h3>
            
            <div className="gb-avatar-selector">
              <div className="current-avatar">{avatar}</div>
              <div className="avatar-grid">
                {avatarList.map(emoji => (
                  <button 
                    key={emoji} 
                    className={`avatar-option ${avatar === emoji ? 'selected' : ''}`}
                    onClick={() => setAvatar(emoji)}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            <div className="nickname-box">
              <label>發言暱稱：</label>
              <input 
                type="text" 
                placeholder="請輸入暱稱" 
                value={nickname} 
                onChange={e => setNickname(e.target.value)}
                maxLength={15}
              />
            </div>
          </div>

          <div className="gb-card status-card">
            <h3>🌐 看板狀態</h3>
            <div className="status-detail">
              <div className="status-row">
                <span className="dot active" />
                <span>儲存媒介：{
                  storageMode === 'public-kv' ? '公共通道 (immanuel.co)' : 
                  storageMode === 'firebase' ? '自訂 Firebase RTDB' : '自訂 Supabase'
                }</span>
              </div>
              <div className="status-row">
                <span className="gb-mini-key">金鑰: <strong>{boardKey}</strong></span>
              </div>
              <div className="status-row sync-status">
                <span>自動同步倒數：{countdown} 秒</span>
                <button className={`gb-sync-now-btn ${loading ? 'spinning' : ''}`} onClick={() => { loadMessages(); setCountdown(REFRESH_INTERVAL); }}>
                  🔄
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* 右側：留言列表與輸入框 */}
        <section className="gb-right-panel gb-card">
          {errorMsg && (
            <div className="gb-error-banner">
              ⚠️ {errorMsg} <button onClick={() => loadMessages()}>重試</button>
            </div>
          )}

          {/* 留言列表 */}
          <div className="gb-messages-container">
            {loading && messages.length === 0 ? (
              <div className="gb-list-loading">
                <div className="spinner"></div>
                <p>正在從雲端載入留言...</p>
              </div>
            ) : messages.length === 0 ? (
              <div className="gb-no-messages">
                <span className="no-msg-icon">🫙</span>
                <p>目前這個看板沒有留言。</p>
                <p className="no-msg-sub">發送第一條留言來跟線上朋友互動吧！</p>
              </div>
            ) : (
              <div className="gb-messages-list">
                {messages.map((msg) => {
                  const isMe = msg.nickname === nickname;
                  const date = new Date(msg.timestamp);
                  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                  
                  return (
                    <div key={msg.id} className={`gb-message-wrapper ${isMe ? 'message-me' : ''}`}>
                      <div className="gb-message-avatar">{msg.avatar}</div>
                      <div className="gb-message-content-box">
                        <div className="gb-message-meta">
                          <span className="gb-message-nickname">{msg.nickname}</span>
                          <span className="gb-message-time">{timeStr}</span>
                        </div>
                        <div className="gb-message-bubble">
                          <p>{msg.content}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* 輸入區 */}
          <form className="gb-input-area" onSubmit={sendMessage}>
            <textarea
              placeholder="請輸入留言內容 (限 200 字)..."
              value={inputContent}
              onChange={e => setInputContent(e.target.value)}
              maxLength={200}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage(e);
                }
              }}
            />
            <div className="gb-input-footer">
              <span className="char-counter">{inputContent.length}/200</span>
              <button 
                type="submit" 
                className="gb-send-btn" 
                disabled={sending || !inputContent.trim()}
              >
                {sending ? '傳送中...' : '送出留言 🚀'}
              </button>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}
