const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateCart, priceOrder, assertVersion, assertOrderTransition, assertSessionClosable } = require('../database/invariants.cjs');
const line = {dishId:'lamb',flavor:'微辣',quantity:2};
const dish = {_id:'lamb',name:'羊肉串',unit:'串',price:600,spicy:true,active:true,onSale:true,soldOut:false};
test('云端金额取菜单值；伪造前端价格不能改变订单快照', () => {
  const priced = priceOrder([{...line,price:1,subtotal:1}],[dish]);
  assert.equal(priced.total,1200); assert.equal(priced.items[0].unitPrice,600);
  dish.price=700; assert.equal(priced.items[0].unitPrice,600); dish.price=600;
  assert.throws(()=>priceOrder([line],[{...dish,soldOut:true}]), /UNAVAILABLE/);
  assert.throws(()=>priceOrder([line],[]), /UNAVAILABLE/);
  assert.throws(()=>priceOrder([],[]), /EMPTY_CART/);
});
test('共享购物车限制数量、口味及行数，不允许重复的菜品口味行', () => {
  for (const quantity of [-1,0,1.5,100,NaN]) assert.throws(()=>validateCart([{...line,quantity}]));
  assert.throws(()=>validateCart([line,line]),/DUPLICATE/);
  assert.throws(()=>validateCart([{...line,flavor:'未知'}]),/FLAVOR/);
  assert.throws(()=>validateCart(Array.from({length:51},(_,i)=>({...line,dishId:String(i)}))),/CART/);
  validateCart([line,{...line,flavor:'不辣'}]);
});
test('并发加购和下单必须携带相同版本；冲突返回刷新', () => {
  assertVersion(5,5); assert.throws(()=>assertVersion(6,5),/VERSION_CONFLICT/);
  assert.throws(()=>assertVersion(1,-1),/INVALID_VERSION/);
});
test('接单与完成不可倒退；支付处理中或已付款订单不能直接取消', () => {
  assertOrderTransition({status:'pending',paymentStatus:'unpaid',activePaymentId:null,paidPaymentId:null},'accepted');
  for (const paymentStatus of ['paying','paid']) assert.throws(()=>assertOrderTransition({status:'pending',paymentStatus},'cancelled'));
  assert.throws(()=>assertOrderTransition({status:'pending',paymentStatus:'unpaid',activePaymentId:'pay-1'},'cancelled'));
  assert.throws(()=>assertOrderTransition({status:'completed'},'accepted'));
});
test('上一桌清空购物车且订单完成结算后才能关桌；跨会话数据拒绝', () => {
  const session={_id:'s1',status:'open'}, cart={sessionId:'s1',lines:[]};
  const order={sessionId:'s1',status:'completed',paymentStatus:'paid',paidPaymentId:'pay-1'};
  assertSessionClosable(session,cart,[order]);
  assert.throws(()=>assertSessionClosable(session,{...cart,lines:[line]},[order]),/CART_NOT_EMPTY/);
  assert.throws(()=>assertSessionClosable(session,cart,[{...order,paymentStatus:'unpaid'}]),/UNSETTLED/);
  assert.throws(()=>assertSessionClosable(session,cart,[{...order,sessionId:'s2'}]),/MISMATCH/);
});
test('所有设计集合默认拒绝客户端读写，索引字段及名称完整', () => {
  const manifest=require('../database/collections.json');
  const rules=require('../cloudfunctions/database.rules.json');
  assert.equal(manifest.scope,'single-store');
  assert.deepEqual(Object.keys(manifest.collections).sort(),Object.keys(rules).sort());
  for(const [name,spec] of Object.entries(manifest.collections)) {
    assert.deepEqual(rules[name],{read:false,write:false});
    assert.equal(new Set(spec.indexes.map(i=>i.name)).size,spec.indexes.length);
    for(const index of spec.indexes) assert.ok(index.fields.length>0);
  }
});
