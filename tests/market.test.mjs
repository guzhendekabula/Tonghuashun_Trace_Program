import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mapEvent, hypothesis, aggregate, hours, daily, monthly, days, events, answer, change } from '../.test-build/market.js'
test('盘后事件映射到下一交易日', () => {
  assert.equal(mapEvent('2026-06-18T16:00:00+08:00').date, '2026-06-19')
})
test('周末和显式休市日映射到下一交易日', () => {
  assert.equal(mapEvent('2026-06-13T10:00:00+08:00').date, '2026-06-15')
  assert.equal(mapEvent('2026-05-01T10:00:00+08:00').date, '2026-05-06')
})
test('缺少证据的因果假设必须为低置信度并声明不确定性', () => {
  const result = hypothesis(events.find(e => e.evidence.length === 0))
  assert.equal(result.confidence, '低')
  assert.match(result.text, /证据不足/)
  assert.match(result.uncertainty, /尚未证实/)
})
test('收盘边界、午休及跨时区转换', () => {
  assert.equal(mapEvent('2026-06-18T14:59:59+08:00').date, '2026-06-18')
  assert.equal(mapEvent('2026-06-18T15:00:00+08:00').date, '2026-06-19')
  assert.equal(mapEvent('2026-06-18T04:00:00Z').date, '2026-06-18')
  assert.equal(mapEvent('2026-06-18T07:00:00Z').date, '2026-06-19')
})
test('异常时间和不足的日历不猜测映射日期', () => {
  assert.equal(mapEvent('2026-06-18T10:00:00').date, null)
  assert.equal(mapEvent('bad').date, null)
  assert.equal(mapEvent('2027-01-01T10:00:00Z').date, null)
})
test('全部股票时日月行情一致且满足 OHLC 约束', () => {
  for (let s = 0; s < 3; s++) {
    assert.equal(monthly[s].length, 3)
    assert.equal(daily[s].length, days.length)
    for (const d of daily[s]) {
      const children = hours[s].filter(h => h.date === d.date)
      assert.equal(children.length, 4)
      assert.deepEqual(aggregate(children, d.date), d)
      assert.ok(d.high >= Math.max(d.open, d.close))
      assert.ok(d.low <= Math.min(d.open, d.close))
    }
    for (const m of monthly[s]) assert.deepEqual(aggregate(daily[s].filter(d => d.date.startsWith(m.date)), m.date), m)
    assert.ok(Math.abs(change(s, days[48])) >= 5)
  }
})
test('首日不伪造涨跌幅；没有事件和未知问题有兜底', () => {
  assert.equal(change(0, days[0]), null)
  assert.match(answer(0, days[0], '分析当前日期'), /没有相关事件/)
  assert.match(answer(0, days[0], '天气怎么样'), /模拟演示/)
})
