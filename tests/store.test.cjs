const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const memory = new Map();
global.wx = { getStorageSync: k => memory.get(k), setStorageSync: (k,v) => memory.set(k,structuredClone(v)) };
const s = require('../miniprogram/utils/store.js');
beforeEach(() => s.reset());
test('纸质菜单八个分区，所有菜品价格使用整数分', () => {
  const state=s.read(); assert.equal(state.categories.length,8); assert.equal(state.dishes.length,54);
  for(const c of state.categories) assert.ok(state.dishes.some(d=>d.categoryId===c.id));
  for(const d of state.dishes) assert.ok(Number.isSafeInteger(d.price));
});
test('分区排序持久化，拒绝重复名称和删除非空分区', () => {
  s.moveCategory('drinks',-1); assert.equal(s.read().categories[6].id,'drinks');
  assert.throws(()=>s.deleteCategory('meat'),/请先/); assert.throws(()=>s.saveCategory(null,'肉串烧烤'),/已经存在/);
  s.saveCategory(null,'新品');const id=s.read().categories.at(-1).id; s.saveCategory(id,'新推荐');assert.equal(s.read().categories.at(-1).name,'新推荐');s.deleteCategory(id);assert.equal(s.read().categories.length,8);
});
test('不同辣度分行，同款累加并限制数量', () => {
  s.changeCart('lamb','微辣',1);s.changeCart('lamb','微辣',2);s.changeCart('lamb','不辣',1);
  assert.equal(s.cartView().items.length,2);assert.equal(s.cartView().count,4);assert.equal(s.cartView().total,1000);
  assert.throws(()=>s.changeCart('lamb','微辣',99),/99/);s.changeCart('lamb','不辣',-1);assert.equal(s.cartView().items.length,1);
});
test('商家改价后重新计价，已提交的历史订单保留价格快照', () => {
  s.changeCart('lamb','微辣',2);const dish=s.read().dishes.find(d=>d.id==='lamb');
  s.saveDish({...dish,price:750});assert.equal(s.cartView().total,1500);
  const order=s.submitOrder('少盐');assert.equal(order.total,1500);assert.equal(s.cartView().count,0);
  s.saveDish({...dish,price:900});assert.equal(s.read().orders[0].items[0].price,750);
  assert.throws(()=>s.submitOrder(''),/先选/);
});
test('下架与售罄阻止新增和提交，仍允许移除购物车', () => {
  s.changeCart('lamb','微辣',1);s.setDishStatus('lamb','soldOut');
  assert.throws(()=>s.changeCart('lamb','微辣',1),/无法点单/);assert.throws(()=>s.submitOrder(''),/售罄/);
  s.changeCart('lamb','微辣',-1);assert.equal(s.cartView().count,0);
  s.setDishStatus('wings','onSale');assert.throws(()=>s.changeCart('wings','不辣',1),/无法点单/);
});
test('删除菜品清理购物车，保留历史订单', () => {
  s.changeCart('lamb','不辣',1);s.submitOrder('');s.changeCart('lamb','不辣',1);s.deleteDish('lamb');
  assert.equal(s.cartView().count,0);assert.equal(s.read().orders[0].items[0].name,'羊肉');
});
test('订单状态不可跳转，付款幂等，取消单不可付款', () => {
  s.changeCart('lemon','标准',1);let o=s.submitOrder('');
  assert.throws(()=>s.updateOrder(o.id,'completed'),/状态/);s.payDemo(o.id);s.payDemo(o.id);
  assert.equal(s.read().orders[0].paid,true);assert.throws(()=>s.updateOrder(o.id,'cancelled'),/付款/);
  s.updateOrder(o.id,'accepted');s.updateOrder(o.id,'completed');assert.throws(()=>s.updateOrder(o.id,'accepted'),/状态/);
  s.changeCart('plum','标准',1);o=s.submitOrder('');s.updateOrder(o.id,'cancelled');assert.throws(()=>s.payDemo(o.id),/不可支付/);
});
test('保存菜品校验价格与分区',()=>{
  const d=s.read().dishes[0];for(const price of [0,-1,NaN,1.2,10000000])assert.throws(()=>s.saveDish({...d,price}),/价格/);
  assert.throws(()=>s.saveDish({...d,categoryId:'missing'}),/分区/);
});
test('菜单快捷加减沿用口味，减至零清空；售罄仍可减少',()=>{
  s.changeDishQuantity('lamb',1);s.changeDishQuantity('lamb',1);
  assert.equal(s.cartView().count,2);assert.equal(s.cartView().total,500);assert.equal(s.cartView().items[0].flavor,'微辣');
  s.changeCart('lamb','不辣',1);s.changeDishQuantity('lamb',1);
  assert.equal(s.cartView().items.find(i=>i.flavor==='不辣').quantity,2);
  s.changeDishQuantity('lamb',-1);s.changeDishQuantity('lamb',-1);
  assert.equal(s.cartView().items.length,1);assert.equal(s.cartView().count,2);
  s.setDishStatus('lamb','soldOut');assert.throws(()=>s.changeDishQuantity('lamb',1),/无法点单/);
  s.changeDishQuantity('lamb',-1);s.changeDishQuantity('lamb',-1);s.changeDishQuantity('lamb',-1);
  assert.equal(s.cartView().count,0);assert.equal(s.cartView().total,0);
  s.changeDishQuantity('lemon',1);assert.equal(s.cartView().items[0].flavor,'标准');
});
test('旧版数据保留订单购物车，并补齐新增门店设置', () => {
  s.changeCart('lamb','微辣',2); const order=s.submitOrder('保留');s.changeCart('lemon','标准',1);
  const old=s.read();delete old.shop;delete old.tables;delete old.currentTable;delete old.printer;
  memory.set('charcoal-demo-v1',old);
  const migrated=s.read();assert.equal(migrated.orders[0].id,order.id);assert.equal(migrated.cart[0].quantity,1);assert.equal(migrated.shop.open,true);assert.equal(migrated.tables.length,3);
});
test('店铺休息拒绝下单，开店后恢复并保存店名欢迎词', () => {
  s.saveShop({name:' 测试烧烤 ',welcome:' 欢迎来吃 ',open:false});s.changeCart('lamb','微辣',1);
  assert.throws(()=>s.submitOrder(''),/休息/);assert.equal(s.cartView().count,1);
  s.saveShop({...s.read().shop,open:true});assert.equal(s.submitOrder('').total,250);assert.equal(s.read().shop.name,'测试烧烤');
  assert.throws(()=>s.saveShop({name:'',welcome:'欢迎',open:true}),/店名/);
});
test('桌台唯一校验、切桌保护、未完成订单阻止改名删除，历史桌号保留', () => {
  assert.throws(()=>s.saveTable(null,'a01'),/已经存在/);
  s.saveTable(null,'B01');const t=s.read().tables.at(-1);s.selectDemoTable(t.id);
  s.changeCart('lamb','微辣',1);assert.throws(()=>s.selectDemoTable('table-a01'),/购物车/);
  const o=s.submitOrder('');assert.equal(o.table,'B01');assert.throws(()=>s.saveTable(t.id,'B02'),/未完成/);assert.throws(()=>s.deleteTable(t.id),/未完成/);
  s.updateOrder(o.id,'accepted');s.updateOrder(o.id,'completed');s.saveTable(t.id,'B02');assert.equal(s.read().currentTable,'B02');assert.equal(s.read().orders[0].table,'B01');
  s.deleteTable(t.id);assert.equal(s.read().currentTable,'A01');
  s.deleteTable('table-a01');s.deleteTable('table-a02');assert.throws(()=>s.deleteTable('table-a06'),/至少/);
});
test('打印设置校验并保存偏好，不生成打印任务', () => {
  s.savePrinter({name:' 后厨 ',serial:' DEMO ',copies:2,autoPrint:true});assert.deepEqual(s.read().printer,{name:'后厨',serial:'DEMO',copies:2,autoPrint:true});
  assert.throws(()=>s.savePrinter({name:'后厨',serial:'',copies:9,autoPrint:true}),/联数/);assert.equal(s.read().orders.length,0);
});
test('升级纸质菜单保留自建内容及订单，升级只执行一次', () => {
  s.changeCart('lamb','微辣',1); const order=s.submitOrder('历史订单');
  const old=s.read(); delete old.menuVersion;
  old.categories=[{id:'meat',name:'肉类'},{id:'veg',name:'素类'},{id:'drinks',name:'饮料'},{id:'custom-cat',name:'自建分区'}];
  old.dishes=old.dishes.filter(d=>['lamb','wings','eggplant','mushroom','lemon','plum'].includes(d.id));
  old.dishes.find(d=>d.id==='lamb').price=600;
  old.dishes.push({...old.dishes[0],id:'custom-dish',categoryId:'custom-cat',name:'自建菜品'});
  old.cart=[{key:'lamb:微辣',dishId:'lamb',flavor:'微辣',quantity:2}];
  old.shop.name='我的烧烤店'; memory.set('charcoal-demo-v1',old);
  const upgraded=s.read();
  assert.equal(upgraded.categories.length,9); assert.equal(upgraded.dishes.length,55);
  assert.equal(upgraded.orders[0].id,order.id);assert.equal(upgraded.cart[0].quantity,2);
  assert.equal(upgraded.shop.name,'我的烧烤店');assert.equal(upgraded.dishes.find(d=>d.id==='lamb').price,250);
  assert.ok(upgraded.dishes.some(d=>d.id==='custom-dish'));
  const dish=upgraded.dishes.find(d=>d.id==='lamb');s.saveDish({...dish,price:800});
  s.deleteDish('pork');assert.equal(s.read().dishes.find(d=>d.id==='lamb').price,800);
  assert.equal(s.read().dishes.some(d=>d.id==='pork'),false);
});
