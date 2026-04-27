const fs = require('fs');
let text = fs.readFileSync('c:/Users/103404/Desktop/mineSweeper/src/EtfApp.tsx', 'utf-8');
const search = '                   {/* Chart */}';
const rep = `                   {/* ETF Constituents Drill-Down Panel */}
                   {isEtf && (
                      <div style={{ marginBottom: '30px', background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', padding: '25px', borderRadius: '16px', border: '1px solid #475569', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.3)' }}>
                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showComponents[data.code] ? 20 : 0 }}>
                            <h3 style={{ color: '#f8fafc', margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center' }}>
                               <span style={{ marginRight: 10, background: '#a855f7', padding: '4px 8px', borderRadius: 8, fontSize: '0.9rem', color: '#fff' }}>ETF</span> 預估前十大成分股
                            </h3>
                            <button onClick={() => fetchComponents(data.code)} style={{ background: '#334155', color: '#f8fafc', border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontWeight: 'bold' }}>
                               {showComponents[data.code] ? '收起清單' : '展開檢視'}
                            </button>
                         </div>
                         
                         {showComponents[data.code] && (
                            <div>
                               {loadingComponents[data.code] ? (
                                  <div style={{ padding: '20px 0', color: '#94a3b8', textAlign: 'center' }}>攔截網頁資料中，請稍候...</div>
                               ) : (
                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
                                     {componentsMap[data.code]?.map((comp, idx) => (
                                        <div 
                                           key={idx} 
                                           onClick={() => {
                                              if(comp.code) {
                                                handleAdd(comp.code, comp.name).then(() => openDetail(comp.code));
                                              }
                                           }}
                                           style={{ background: '#1e293b', padding: '15px', borderRadius: '12px', border: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: comp.code ? 'pointer' : 'default', transition: 'background 0.2s' }}
                                           onMouseEnter={e => comp.code && (e.currentTarget.style.background = '#334155')}
                                           onMouseLeave={e => comp.code && (e.currentTarget.style.background = '#1e293b')}
                                        >
                                           <div>
                                              <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#f8fafc', marginBottom: 4 }}>{comp.name}</div>
                                              <div style={{ color: '#64748b', fontSize: '0.85rem' }}>{comp.code}</div>
                                           </div>
                                           <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#38bdf8' }}>{comp.weight}{comp.weight !== '0' && '%'}</div>
                                        </div>
                                     ))}
                                  </div>
                               )}
                            </div>
                         )}
                      </div>
                   )}

                   {/* Chart */}`;
text = text.replace(search, rep);
fs.writeFileSync('c:/Users/103404/Desktop/mineSweeper/src/EtfApp.tsx', text);
