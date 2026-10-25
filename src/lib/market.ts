export type Candle = { date: string; label: string; open: number; high: number; low: number; close: number; volume: number }
export type Event = { id: string; stock: number; title: string; time: string; type: string; source: string; summary: string; evidence: string[]; opinion?: boolean }
export const stocks = [
  { name: '澄芯科技', code: 'SIM001', industry: '半导体 · 科技创新', base: 42 },
  { name: '沐光能源', code: 'SIM002', industry: '新能源 · 清洁能源', base: 28 },
  { name: '云禾消费', code: 'SIM003', industry: '消费 · 品牌零售', base: 65 },
]
export const calendar = Array.from({ length: 100 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 3, 1 + i))
  return { date: d.toISOString().slice(0, 10), trading: d.getUTCDay() !== 0 && d.getUTCDay() !== 6 && !['2026-05-01', '2026-05-04', '2026-05-05'].includes(d.toISOString().slice(0, 10)) }
})
export const days = calendar.filter(d => d.trading && d.date <= '2026-06-30').map(d => d.date)
export function exchangeTime(time: string) {
  if (!/(Z|[+-]\d{2}:\d{2})$/.test(time) || !Number.isFinite(Date.parse(time))) return null
  return new Date(Date.parse(time) + 8 * 3600000).toISOString().slice(0, 19).replace('T', ' ')
}
export function mapEvent(time: string, cal = calendar): { date: string | null; reason: string } {
  const local = exchangeTime(time)
  if (!local) return { date: null, reason: '时间异常：无法解析或缺少时区' }
  const date = local.slice(0, 10)
  if (cal.some(d => d.date === date && d.trading) && local.slice(11) < '15:00:00') return { date, reason: '收盘前事件 → 当日' }
  return { date: cal.find(d => d.trading && d.date > date)?.date ?? null, reason: '盘后或休市日 → 下一交易日' }
}
export function aggregate(rows: Candle[], date: string, label = date): Candle {
  return { date, label, open: rows[0].open, close: rows.at(-1)!.close, high: Math.max(...rows.map(r => r.high)), low: Math.min(...rows.map(r => r.low)), volume: rows.reduce((n, r) => n + r.volume, 0) }
}
export const hours = stocks.map((stock, s) => {
  let price = stock.base
  return days.flatMap((date, i) => {
    const move = i === 20 ? (s === 1 ? -.078 : .072) : i === 48 ? (s === 1 ? -.085 : .082) : Math.sin(i * 1.7 + s) * .015 + .001
    const start = price
    return ['09:30–10:30', '10:30–11:30', '13:00–14:00', '14:00–15:00'].map((label, h) => {
      const open = price
      price = start * (1 + move * (h + 1) / 4)
      return { date, label, open, close: price, high: Math.max(open, price) * 1.004, low: Math.min(open, price) * .996, volume: Math.round(180000 + (1 + Math.sin(i + h)) * 90000 + (Math.abs(move) > .05 ? 200000 : 0)) }
    })
  })
})
export const daily = hours.map(rows => days.map(date => aggregate(rows.filter(r => r.date === date), date)))
export const monthly = daily.map(rows => ['2026-04', '2026-05', '2026-06'].map(month => aggregate(rows.filter(r => r.date.startsWith(month)), month, month)))
export function change(stock: number, date: string) {
  const i = days.indexOf(date)
  return i > 0 ? (daily[stock][i].close / daily[stock][i - 1].close - 1) * 100 : null
}
export const isAnomaly = (stock: number, date: string) => Math.abs(change(stock, date) ?? 0) >= 5
export const events: Event[] = stocks.flatMap((_, s) => [20, 48].flatMap((i, n) => {
  const previous = days[i - 1]
  return [
    { id: `${s}-${n}-a`, stock: s, title: s === 0 ? '季度经营报告：净利润同比增长 32%' : s === 1 ? '行业供需观察：新增产能带来价格压力' : '市场关注度提升，短期交易活跃', time: `${previous}T16:20:00+08:00`, type: s === 0 ? '公告' : s === 1 ? '行业事件' : '新闻', source: s === 0 ? '模拟公司公告中心' : '模拟行业观察站', summary: s === 0 ? '季度收入与盈利增长，公告在前一交易日收盘后披露。' : s === 1 ? '行业评论认为供给增加可能影响产品价格，尚无公司实际订单变化证据。' : '市场评论提及关注度变化，但缺少成交主体及资金流向证据。', evidence: s === 2 ? [] : s === 0 ? ['模拟一季报：营业收入 12.8 亿元，同比增长 18%。', '归母净利润 1.6 亿元，同比增长 32%；报告期：2026 年第一季度。'] : ['模拟行业简报：样本企业新增产能计划合计增长 15%。'], opinion: s !== 0 },
    { id: `${s}-${n}-b`, stock: s, title: '财务数据披露与经营背景', time: `${days[i]}T01:00:00Z`, type: '财务披露', source: '模拟财务资料库', summary: '供核对的财务背景，不代表已证明当日价格波动的原因。', evidence: [`报告期：2026 年第一季度；营业收入 ${[12.8, 8.4, 21.6][s]} 亿元。`, `同比变化：${[18, -6, 4][s]}%；披露日期：${days[i]}。`] },
  ]
}))
events.push({ id: 'weekend', stock: 0, title: '周末产业论坛发布技术合作计划', time: '2026-06-13T10:00:00+08:00', type: '行业事件', source: '模拟产业论坛', summary: '合作计划尚未转化为订单，周末发布，映射至周一。', evidence: ['论坛纪要：企业拟共同开展技术验证，尚未签署销售合同。'] })
export const related = (stock: number, date: string) => events.filter(e => e.stock === stock && mapEvent(e.time).date === date)
export function hypothesis(event: Event) {
  return { confidence: event.evidence.length ? '中' : '低', text: event.evidence.length ? '事件与行情存在时间关联，可能影响市场预期。' : '证据不足，无法确认该事件是否影响价格。', uncertainty: '因果假设尚未证实；无法排除市场整体行情、交易情绪等其他因素。' }
}
export function answer(stock: number, date: string, question: string, list = related(stock, date)) {
  if (!/分析|异动|证据|依据|因果|为什么/.test(question)) return '当前为模拟演示，支持分析当前日期、查看主要证据和解释因果不确定性。请使用下方快捷问题，或通过页面选择器切换股票与日期。'
  if (/因果|为什么/.test(question)) return '时间相关性不等于因果关系。\n\n事件与价格波动同时出现，只能说明时间接近。缺少对照研究及交易主体证据，无法排除市场行情、投资者情绪等因素。\n\n本助手的置信度是预设规则对证据支持程度的判断，不是统计概率；所有因果假设均未证实。'
  const pct = change(stock, date)
  return `${stocks[stock].name} · ${date}\n当日涨跌幅 ${pct === null ? '不可计算' : `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`}。${isAnomaly(stock, date) ? '达到日级异动阈值。' : '未达到 5% 异动阈值。'}\n\n` + (list.length ? list.slice(0, 3).map((e, i) => { const h = hypothesis(e); return `${i + 1}. ${e.title}\n【${e.opinion ? '观点' : '事实'}】${e.summary}\n【时间相关性】事件映射到当前交易日。\n【因果假设 · ${h.confidence}置信度】${h.text}\n依据：${e.evidence.join(' ') || '暂无可核验的支持材料。'}\n不确定性：${h.uncertainty}` }).join('\n\n') : '当前日期没有相关事件，证据不足，暂不生成影响因素。')
}
