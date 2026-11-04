const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('今日接待桌数按用餐去重，加单不重复，翻台另计，排除取消及昨日订单', () => {
  const now = Date.now();
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  const orders = [
    { sessionId: 'visit-1', tableId: 'A01' },
    { sessionId: 'visit-1', tableId: 'A01' },
    { sessionId: 'visit-2', tableId: 'A01' },
    { table: 'A02' }, { table: 'A02' },
    { sessionId: 'cancelled', status: 'cancelled' },
    { sessionId: 'yesterday', createdAt: yesterday.getTime() }
  ].map(o => ({ createdAt: now, status: 'completed', paid: true, total: 100, ...o }));
  let page;
  const repository = {
    read: () => ({ shop: {}, dishes: [], categories: [], tables: [] }),
    orderView: () => orders, money: cents => (cents / 100).toFixed(2)
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../miniprogram/pages/manage/index.js'), 'utf8'), {
    exports: {}, Page: definition => { page = definition; },
    require: name => name.endsWith('/auth') ? { merchantPage: p => p } : repository
  });
  page.setData = patch => Object.assign(page.data, patch);
  page.refresh();
  assert.equal(page.data.todayTableCount, 3);
  assert.equal(page.data.paidText, '5.00');
});
