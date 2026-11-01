const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const memory = new Map();
let modal;
global.wx = {
  getStorageSync: key => memory.get(key),
  setStorageSync: (key, value) => memory.set(key, structuredClone(value)),
  showModal: options => { modal = options; }, showToast() {}
};
require('../miniprogram/config').cloudConfig.businessCloud = false;
const store = require('../miniprogram/utils/store');
const { orderPage } = require('../miniprogram/utils/order-page');
let menuDefinition;
global.Page = definition => { menuDefinition = definition; };
require('../miniprogram/pages/menu/index');
const instance = definition => ({ ...definition, data: structuredClone(definition.data), setData(patch) { Object.assign(this.data, patch); } });
const order = () => { store.changeCart('lamb', '不辣', 1); return store.submitOrder('少盐'); };
beforeEach(() => { store.reset(); modal = null; });

test('分区下架隐藏顾客菜单，阻止旧购物车提交；重新上架保留菜品原状态', () => {
  store.changeCart('lamb', '不辣', 1);
  const other = store.read().dishes.find(d => d.categoryId === 'meat' && d.id !== 'lamb');
  store.setDishStatus(other.id, 'soldOut');
  const dishes = store.read().dishes;
  store.setCategoryStatus('meat');
  const page = instance(menuDefinition); page.refresh();
  assert.ok(!page.data.categories.some(c => c.id === 'meat'));
  assert.ok(!page.data.dishes.some(d => d.categoryId === 'meat'));
  assert.equal(store.cartView().items[0].available, false);
  assert.throws(() => store.changeCart('lamb', '不辣', 1), /无法点单/);
  assert.throws(() => store.submitOrder(''), /分区下架/);
  store.changeCart('lamb', '不辣', -1); assert.equal(store.cartView().count, 0);
  store.setCategoryStatus('meat');
  assert.deepEqual(store.read().dishes, dishes);
  page.refresh(); assert.ok(page.data.categories.some(c => c.id === 'meat'));
  store.changeCart('lamb', '不辣', 1); assert.ok(store.submitOrder('').total > 0);
});

test('全部分区下架时顾客菜单为空；新建分区默认上架，删除非空分区被阻止', () => {
  store.read().categories.forEach(c => store.setCategoryStatus(c.id));
  const page = instance(menuDefinition); page.refresh();
  assert.equal(page.data.categories.length, 0); assert.equal(page.data.dishes.length, 0);
  store.saveCategory(null, '新推荐');
  const category = store.read().categories.at(-1);
  const dish = { ...store.read().dishes[0], id: 'new-dish', categoryId: category.id };
  store.saveDish(dish); page.refresh();
  assert.equal(page.data.dishes[0].id, dish.id);
  assert.throws(() => store.deleteCategory(category.id), /移动或删除/);
  store.deleteDish(dish.id); store.deleteCategory(category.id);
  assert.ok(!store.read().categories.some(c => c.id === category.id));
});

test('商家取消需确认，可取消已付款制作中订单；保留快照且统计排除制作中', async () => {
  const original = order(); store.payDemo(original.id); store.updateOrder(original.id, 'accepted');
  const page = instance(orderPage(true)); page.refresh(); assert.equal(page.data.makingCount, 1);
  const event = { currentTarget: { dataset: { id: original.id, status: 'cancelled' } } };
  page.action(event); modal.success({ confirm: false });
  assert.equal(store.read().orders[0].status, 'accepted');
  page.action(event); await modal.success({ confirm: true });
  const cancelled = store.read().orders[0];
  assert.equal(cancelled.status, 'cancelled'); assert.equal(cancelled.paid, true);
  assert.deepEqual(cancelled.items, original.items); assert.equal(cancelled.total, original.total);
  assert.equal(page.data.makingCount, 0); assert.equal(page.data.cancelledCount, 1);
  page.filter({ currentTarget: { dataset: { id: 'cancelled' } } }); assert.equal(page.data.orders.length, 1);
  assert.throws(() => store.cancelMerchantOrder(original.id), /已结束/);
  assert.throws(() => store.payDemo(original.id), /不可支付/);
});

test('顾客不能取消已付款订单；商家也不能取消已完成订单', () => {
  const original = order(); store.payDemo(original.id);
  const page = instance(orderPage(false)); page.action({ currentTarget: { dataset: { id: original.id, status: 'cancelled' } } });
  modal.success({ confirm: true }); assert.equal(store.read().orders[0].status, 'pending');
  store.updateOrder(original.id, 'accepted'); store.updateOrder(original.id, 'completed');
  assert.throws(() => store.cancelMerchantOrder(original.id), /已结束/);
});
