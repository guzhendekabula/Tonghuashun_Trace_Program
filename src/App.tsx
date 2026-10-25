import { useEffect, useRef, useState } from 'react'
import { stocks, days, daily, monthly, hours, change, isAnomaly, related, mapEvent, exchangeTime, answer } from './lib/market'
import type { Candle, Event } from './lib/market'

type Message = { id: number; role: 'user' | 'assistant'; stock: number; date: string; text: string; full?: string; refs?: Event[]; status?: string }
const quick = ['分析当前日期', '查看主要证据', '为什么不能确定因果']
const scenarios = ['正常数据', '加载中', '无行情', '无关联事件', '范围外事件', '异常时间', '异常行情', '日历不足', '证据不足']
function Chart({ rows, stock, selected, onSelect, period }: { rows: Candle[]; stock: number; selected: string; onSelect: (date: string) => void; period: string }) {
  const [hover, setHover] = useState<Candle | null>(null)
  const max = Math.max(...rows.map(c => c.high)) * 1.01, min = Math.min(...rows.map(c => c.low)) * .99
  const y = (price: number) => 245 - (price - min) / (max - min) * 210
  const width = 880 / rows.length
  // Reserve space for the final date instead of crowding the preceding tick.
  const minTickGap = 60
  const showTick = (index: number) => rows.length < 5 || index === rows.length - 1
    || (index % 10 === 0 && (rows.length - 1 - index) * width >= minTickGap)
  return <><div className="chart-info">{hover ? `${hover.label} 开 ${hover.open.toFixed(2)} 高 ${hover.high.toFixed(2)} 低 ${hover.low.toFixed(2)} 收 ${hover.close.toFixed(2)}` : '悬停查看 OHLC · 点击 K 线查看事件'}<span>价格 / CNY</span></div><svg className="chart" viewBox="0 0 960 340" role="group" aria-label={`${period}价格图`}>
    {[0, 1, 2, 3, 4].map(i => { const value = min + (max - min) * i / 4; return <g key={i}><line x1="15" x2="900" y1={y(value)} y2={y(value)} stroke="#edf0f5" /><text x="910" y={y(value) + 4}>{value.toFixed(2)}</text></g> })}
    {rows.map((r, i) => { const x = 20 + i * width + width / 2, up = r.close >= r.open, chosen = period === '时 K' ? hover?.label === r.label : r.date === selected, anomaly = period === '月 K' ? days.some(d => d.startsWith(r.date) && isAnomaly(stock, d)) : isAnomaly(stock, r.date); return <g key={r.date + r.label} tabIndex={0} role="button" aria-label={`${r.label} 收盘 ${r.close.toFixed(2)}${anomaly ? ' 含异动' : ''}`} onMouseEnter={() => setHover(r)} onFocus={() => setHover(r)} onClick={() => { setHover(r); onSelect(r.date) }} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setHover(r); onSelect(r.date) } }} className="candle">
      <rect x={x - width / 2} y="15" width={width} height="285" fill={chosen ? '#eaf1ff' : 'transparent'} />
      <line x1={x} x2={x} y1={y(r.high)} y2={y(r.low)} stroke={up ? '#dc6570' : '#299e89'} />
      <rect x={x - Math.min(width * .29, 26)} y={y(Math.max(r.open, r.close))} width={Math.min(width * .58, 52)} height={Math.max(1.5, Math.abs(y(r.open) - y(r.close)))} fill={up ? '#dc6570' : '#299e89'} />
      <rect x={x - Math.min(width * .29, 26)} y={300 - r.volume / Math.max(...rows.map(v => v.volume)) * 30} width={Math.min(width * .58, 52)} height={r.volume / Math.max(...rows.map(v => v.volume)) * 30} fill={up ? '#f0c9ce' : '#bce4da'} />
      {anomaly && period !== '时 K' && <circle cx={x} cy={y(r.high) - 10} r="3.5" fill="#4a72bf" />}
      {showTick(i) && <text x={x} y="325" textAnchor="middle">{period === '时 K' ? r.label : r.label.slice(5)}</text>}
    </g> })}
  </svg></>
}
function App() {
  const [stock, setStock] = useState(0), [date, setDate] = useState(days[48]), [period, setPeriod] = useState('日 K')
  const [scene, setScene] = useState('正常数据'), [selected, setSelected] = useState<string | null>(null)
  const [open, setOpen] = useState(false), [input, setInput] = useState(''), [messages, setMessages] = useState<Message[]>([])
  const [active, setActive] = useState<number | null>(null)
  const serial = useRef(0), timeline = useRef<HTMLDivElement>(null)
  const normal = related(stock, date)
  const synthetic: Event = { id: 'demo', stock, title: scene, time: scene === '异常时间' ? '未知时间' : scene === '日历不足' ? '2026-12-31T16:00:00+08:00' : '2026-06-30T16:00:00+08:00', type: '公告', source: '模拟异常数据集', summary: '用于复现边界状态的独立测试记录。', evidence: [] }
  const list = scene === '无关联事件' ? [] : ['范围外事件', '异常时间', '日历不足'].includes(scene) ? [synthetic] : scene === '证据不足' ? [{ ...synthetic, time: `${date}T09:00:00+08:00`, title: '未经证实的市场传闻', opinion: true }] : normal
  const detail = list.find(e => e.id === selected) ?? list[0]
  const candle = daily[stock].find(c => c.date === date)!, pct = change(stock, date)
  const rows = period === '月 K' ? monthly[stock] : period === '时 K' ? hours[stock].filter(c => c.date === date) : daily[stock]
  const unavailable = ['无行情', '加载中', '异常行情'].includes(scene)
  function stop() { setActive(null); setMessages(m => m.map(x => x.status === '输出中' ? { ...x, status: '已停止' } : x)) }
  function context(s: number, d: string) { stop(); setStock(s); setDate(d); setSelected(null) }
  function send(question: string) {
    if (!question.trim() || active !== null || unavailable) return
    const id = ++serial.current
    const usable = list.filter(e => mapEvent(e.time).date === date)
    setMessages(m => [...m, { id: id * 2, role: 'user', stock, date, text: question }, { id: id * 2 + 1, role: 'assistant', stock, date, text: '', full: answer(stock, date, question, usable), refs: /分析|异动|证据|依据/.test(question) && !/因果|为什么/.test(question) ? usable : [], status: '输出中' }])
    setActive(id * 2 + 1); setInput('')
  }
  useEffect(() => {
    if (active === null) return
    const timer = window.setInterval(() => setMessages(m => m.map(x => x.id === active && x.full ? { ...x, text: x.full.slice(0, x.text.length + 12), status: x.text.length + 12 >= x.full.length ? '完成' : '输出中' } : x)), 35)
    return () => window.clearInterval(timer)
  }, [active])
  const finished = active !== null && messages.some(m => m.id === active && m.status === '完成')
  useEffect(() => { if (finished) { const timer = setTimeout(() => setActive(null), 0); return () => clearTimeout(timer) } }, [finished])
  function locate(e: Event, s: number, d: string) { context(s, d); setScene(e.id === 'demo' ? '证据不足' : '正常数据'); setSelected(e.id); timeline.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }
  return <div className="app"><header><a className="brand" href="#"><span className="logo">⌁</span> 迹线 <span className="brand-en">TRACE</span></a><nav>市场观察 <span>事件研究工作台</span></nav><span className="demo">● 全部为模拟数据</span></header>
    <main><div className="page-heading"><div><div className="eyebrow">MARKET INTELLIGENCE / 事件研究</div><h1>每一次波动，都值得追问。</h1><p>沿着价格寻找线索，让每一条解释都有据可循。</p></div><label className="scenario">演示场景<select value={scene} onChange={e => { stop(); setScene(e.target.value); setSelected(null) }}>{scenarios.map(s => <option key={s}>{s}</option>)}</select></label></div>
    <div className="stock-grid">{stocks.map((s, i) => <button key={s.code} className={`stock-card ${stock === i ? 'chosen' : ''}`} onClick={() => context(i, days[48])}><span className="stock-icon">{s.name[0]}</span><span><strong>{s.name}</strong><small>{s.code} · {s.industry}</small></span><span className="stock-price">{daily[i][48].close.toFixed(2)}<small className={(change(i, days[48]) ?? 0) > 0 ? 'up' : 'down'}>{(change(i, days[48]) ?? 0) > 0 ? '+' : ''}{change(i, days[48])?.toFixed(2)}%</small></span></button>)}</div>
    <section className="panel market"><div className="section-head"><div><h2>{stocks[stock].name} <span className="badge">模拟 A 股</span></h2><p>2026.04.01 — 2026.06.30 · Asia/Shanghai</p></div><div className="segmented">{['月 K', '日 K', '时 K'].map(p => <button className={p === period ? 'active' : ''} key={p} onClick={() => setPeriod(p)}>{p}</button>)}</div></div>
    <div className="quote"><strong className={(pct ?? 0) >= 0 ? 'up' : 'down'}>{candle.close.toFixed(2)}</strong><span className={(pct ?? 0) >= 0 ? 'up' : 'down'}>{pct === null ? '—' : `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`}</span><span className="quote-date">{date} <span className="badge">{isAnomaly(stock, date) ? '异动交易日' : '普通交易日'}</span></span><span className="ohlc">开 {candle.open.toFixed(2)} 高 {candle.high.toFixed(2)} 低 {candle.low.toFixed(2)}</span></div>
    {unavailable ? <div className="empty chart-empty">{scene === '加载中' ? '◌ 正在加载模拟行情…' : scene === '异常行情' ? '行情记录异常：最高价低于收盘价。已隔离异常数据，暂停分析。' : '暂无行情数据'}<button onClick={() => setScene('正常数据')}>恢复正常场景</button></div> : <Chart rows={rows} stock={stock} selected={date} period={period} onSelect={d => { if (period === '月 K') { const inMonth = days.filter(v => v.startsWith(d)); context(stock, inMonth.filter(v => isAnomaly(stock, v)).at(-1) ?? inMonth.at(-1)!); setPeriod('日 K') } else context(stock, d) }} />}
    <div className="chart-footer"><span>● {period === '月 K' ? '月内含日级异动' : '日涨跌幅绝对值 ≥ 5%'}  <span className="muted">下方柱状图为成交量</span></span><div><button disabled={days.indexOf(date) === 0} onClick={() => context(stock, days[days.indexOf(date) - 1])}>← 前一交易日</button><input aria-label="选择交易日" type="date" value={date} min={days[0]} max={days.at(-1)} onChange={e => { if (days.includes(e.target.value)) context(stock, e.target.value) }} /><button disabled={date === days.at(-1)} onClick={() => context(stock, days[days.indexOf(date) + 1])}>后一交易日 →</button></div></div></section>
    <div className="research-grid" ref={timeline}><section className="panel timeline"><div className="section-head"><div><h2>事件时间线 <span className="count">{list.length}</span></h2><p>{date} · 根据交易日历关联</p></div><span className="badge">证据可追溯</span></div>{list.length === 0 ? <div className="empty">当日没有相关事件<br /><small>时间接近也不代表因果关系。</small></div> : list.map(e => { const mapping = mapEvent(e.time); return <button className={`event ${detail?.id === e.id ? 'selected' : ''}`} key={e.id} onClick={() => setSelected(e.id)}><span className="event-dot" /><div className="event-meta"><span>{e.type}</span><time>{exchangeTime(e.time) ?? '时间异常'}</time></div><h3>{e.title}</h3><p>{e.summary}</p><div className="tags"><span>{e.opinion ? '观点' : '事实'}</span><span>{mapping.date === date ? '时间相关性' : mapping.date ? '超出行情范围' : '无法映射'}</span><span>查看证据 ↗</span></div></button> })}<div className="notice">ⓘ 时间关联仅提供研究线索，不代表已证实的因果关系。</div></section>
    <section className="panel details"><div className="section-head"><h2>事件详情</h2><span className="muted">SOURCE & EVIDENCE</span></div>{detail ? <><span className="badge">{detail.type} · {detail.opinion ? '观点' : '事实'}</span><h3>{detail.title}</h3><dl><dt>模拟来源</dt><dd>{detail.source}</dd><dt>原始时间</dt><dd>{detail.time}</dd><dt>交易所时间</dt><dd>{exchangeTime(detail.time) ?? '无效时间'}</dd><dt>关联交易日</dt><dd>{mapEvent(detail.time).date ?? '无法映射'}</dd></dl><div className="mapping">↳ {mapEvent(detail.time).date ? mapEvent(detail.time).reason : '异常时间或交易日历不足，无法映射'}</div><p>{detail.summary}</p><h4>证据摘录 <span className="muted">/ 本地模拟资料</span></h4>{detail.evidence.length ? detail.evidence.map((ev, i) => <blockquote key={ev}><span>证据 {i + 1}</span>{ev}</blockquote>) : <div className="notice">证据不足 · 低置信度<br />缺少可核验材料，不能据此确认因果。</div>}</> : <div className="empty">选择事件，查看来源与证据。</div>}</section></div><footer>TRACE 迹线 · 模拟研究工作台<span>固定数据 · 无外部模型调用 · 不构成投资建议</span></footer></main>
    {!open && <button className="agent-launch" onClick={() => { setOpen(true); if (!messages.some(m => m.stock === stock && m.date === date)) send(`请分析${stocks[stock].name}在${date}的股价异动，并提供相关事件和证据。`) }}><span>✧</span> 询问异动助手 <span>↗</span></button>}
    {open && <aside className="chat" aria-label="异动助手聊天窗口"><div className="chat-head"><span className="agent-icon">✧</span><div><strong>迹线 · 异动助手</strong><small>{stocks[stock].name} / {date}</small></div><button aria-label="收起助手" onClick={() => setOpen(false)}>—</button></div><div className="chat-disclaimer">模拟 Agent · 基于内置数据与预设规则</div><div className="messages">{messages.map(m => <article key={m.id} className={`message ${m.role}`}><small>{m.role === 'user' ? '你' : '✧ 迹线助手'} · {stocks[m.stock].name} · {m.date}</small><div>{m.text || '正在整理事件与证据…'}</div>{m.status === '完成' && m.refs?.map(e => <button className="citation" key={e.id} onClick={() => locate(e, m.stock, m.date)}>↗ {e.evidence.length ? '查看证据' : '查看事件 · 证据不足'}：{e.title}</button>)}{m.status === '已停止' && <small>已停止 · 可重新提问</small>}</article>)}{!messages.some(m => m.stock === stock && m.date === date) && <div className="notice">分析对象已切换，点击“分析当前日期”发起查询。</div>}</div><div className="chat-controls"><div className="quick">{quick.map(q => <button disabled={active !== null || unavailable} key={q} onClick={() => send(q)}>{q}</button>)}</div><form onSubmit={e => { e.preventDefault(); send(input) }}><textarea aria-label="输入问题" placeholder="输入问题，或使用上方快捷提问…" value={input} disabled={active !== null || unavailable} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(input) } }} /><div><small>演示支持有限问题 · Shift + Enter 换行</small>{active !== null ? <button type="button" onClick={stop}>停止 ■</button> : <button type="submit" disabled={!input.trim() || unavailable}>发送 ↑</button>}</div></form></div></aside>}
  </div>
}
export default App
