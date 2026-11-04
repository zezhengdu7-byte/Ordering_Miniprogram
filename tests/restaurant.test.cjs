const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {createService}=require('../cloudfunctions/restaurant/service');
const validators=require('../cloudfunctions/restaurant/invariants.cjs');
function fixture(){
 const data=new Map();const bucket=n=>{if(!data.has(n))data.set(n,new Map());return data.get(n);};
 const collection=n=>({doc(id){return {async get(){return {data:bucket(n).has(id)?{...structuredClone(bucket(n).get(id)),_id:id}:null};},async set({data:d}){bucket(n).set(id,structuredClone(d));},async update({data:d}){assert(bucket(n).has(id));Object.assign(bucket(n).get(id),structuredClone(d));}};},where(filter){let skip=0,limit=100;return {orderBy(){return this;},skip(x){skip=x;return this;},limit(x){limit=x;return this;},async get(){return {data:[...bucket(n)].map(([id,d])=>({...structuredClone(d),_id:id})).filter(d=>Object.entries(filter).every(([k,v])=>d[k]===v)).slice(skip,skip+limit)};}};}});
 const db={collection,async runTransaction(fn){const before=structuredClone(data);try{return await fn({collection(n){return {doc:collection(n).doc};}});}catch(e){data.clear();for(const [k,v]of before)data.set(k,v);throw e;}}};
 const sid='a'.repeat(32);bucket('stores').set('store',{storeId:'charcoal-demo',appId:'wx7dc3e02ff34b0133',active:true,open:true,cutleryPrice:100,napkinPrice:100});bucket('catalog_meta').set('menu',{version:1});bucket('categories').set('meat',{active:true,onSale:true});bucket('dishes').set('lamb',{active:true,onSale:true,soldOut:false,categoryId:'meat',price:250,name:'羊肉',unit:'串',spicy:true});bucket('tables').set('table',{active:true,name:'A01',currentSessionId:sid});bucket('sessions').set(sid,{status:'open',tableId:'table',unsettledOrderIds:[],dining:{people:2,cutlery:0,napkins:0,cutleryPrice:100,napkinPrice:100,total:0,confirmed:true}});
 const key=crypto.createHash('sha256').update(sid+':alice').digest('hex');bucket('session_members').set(key,{sessionId:sid,openid:'alice',active:true});
 const call=(action,payload={},user='alice',role='customer')=>createService(db,{OPENID:user},{role},validators).dispatch({action,payload});
 const payload={requestId:'request-1',sessionId:sid,tableId:'table',note:'少盐',lines:[{dishId:'lamb',flavor:'微辣',quantity:5,price:1}]};return {call,bucket,sid,payload};
}
test('云端订单使用扫码会话、服务器价格、幂等请求；事务只使用文档读写',async()=>{const f=fixture();const a=await f.call('submitOrder',f.payload);assert.equal(a.total,1250);const b=await f.call('submitOrder',f.payload);assert.equal(b.id,a.id);assert.equal(f.bucket('orders').size,1);assert.deepEqual(f.bucket('sessions').get(f.sid).unsettledOrderIds,[a.id]);await assert.rejects(f.call('submitOrder',{...f.payload,note:'改内容'}),/REQUEST_REUSED/);assert.equal((await f.call('orders',{},'bob')).length,0);assert.equal((await f.call('orders',{})).length,1);await assert.rejects(f.call('orders',{merchant:true}),/FORBIDDEN/);});
test('伪造桌台、他人会话、失效会话和下架菜品均不能提交',async()=>{const f=fixture();await assert.rejects(f.call('submitOrder',f.payload,'bob'),/FORBIDDEN/);f.bucket('sessions').get(f.sid).status='closed';await assert.rejects(f.call('submitOrder',f.payload),/SESSION_CLOSED/);f.bucket('sessions').get(f.sid).status='open';f.bucket('dishes').get('lamb').soldOut=true;await assert.rejects(f.call('submitOrder',f.payload),/DISH_UNAVAILABLE/);assert.equal(f.bucket('orders').size,0);assert.equal(f.bucket('catalog_meta').get('menu').version,1);});
test('商家处理云端订单校验权限和版本；完成且模拟付款后移出关桌阻挡清单',async()=>{const f=fixture();const a=await f.call('submitOrder',f.payload);await assert.rejects(f.call('updateOrder',{id:a.id,status:'accepted',version:1}),/FORBIDDEN/);await assert.rejects(f.call('updateOrder',{id:a.id,status:'accepted',version:0},'owner','owner'),/VERSION_CONFLICT/);const b=await f.call('updateOrder',{id:a.id,status:'accepted',version:1},'owner','owner');const c=await f.call('updateOrder',{id:a.id,status:'completed',version:b.version},'owner','owner');assert.equal(f.bucket('sessions').get(f.sid).unsettledOrderIds.length,1);const d=await f.call('payDemo',{id:a.id});assert.equal(d.paid,true);assert.equal(d.paymentStatus,'unpaid');assert.equal(f.bucket('sessions').get(f.sid).unsettledOrderIds.length,0);assert.equal((await f.call('payDemo',{id:a.id})).version,d.version);});
test('顾客只能取消本人未付款待接单订单，历史订单保留快照',async()=>{const f=fixture();const a=await f.call('submitOrder',f.payload);await assert.rejects(f.call('cancelCustomerOrder',{id:a.id,status:'cancelled',version:1},'bob'),/FORBIDDEN/);await f.call('cancelCustomerOrder',{id:a.id,status:'cancelled',version:1});assert.equal(f.bucket('orders').get(a.id).total,1250);assert.deepEqual(f.bucket('sessions').get(f.sid).unsettledOrderIds,[]);await assert.rejects(f.call('payDemo',{id:a.id}),/INVALID_ORDER_TRANSITION/);});
test('餐具与纸巾费用按服务端确认值计入首单，加单不重复，取消首单释放费用',async()=>{const f=fixture();delete f.bucket('sessions').get(f.sid).dining;await assert.rejects(f.call('submitOrder',f.payload),/DINING_REQUIRED/);await assert.rejects(f.call('setDining',{sessionId:f.sid,people:2,cutlery:2,napkins:1,cutleryPrice:1,napkinPrice:1}),/FEE_CHANGED/);const confirmed=await f.call('setDining',{sessionId:f.sid,people:2,cutlery:2,napkins:1,cutleryPrice:100,napkinPrice:100});assert.equal(confirmed.dining.total,300);const first=await f.call('submitOrder',f.payload);assert.equal(first.total,1550);const second=await f.call('submitOrder',{...f.payload,requestId:'second'});assert.equal(second.total,1250);await f.call('cancelCustomerOrder',{id:first.id,status:'cancelled',version:1});const third=await f.call('submitOrder',{...f.payload,requestId:'third'});assert.equal(third.total,1550);});
test('代客与顾客复用提交及餐具计费流程，来源由云端成员记录决定',async()=>{
 const f=fixture();
 const key=crypto.createHash('sha256').update(f.sid+':owner').digest('hex');
 f.bucket('session_members').set(key,{sessionId:f.sid,openid:'owner',active:true,source:'merchant-assist'});
 delete f.bucket('sessions').get(f.sid).dining;
 await assert.rejects(f.call('submitOrder',f.payload,'owner','owner'),/DINING_REQUIRED/);
 await f.call('setDining',{sessionId:f.sid,people:2,cutlery:2,napkins:1,cutleryPrice:100,napkinPrice:100},'owner','owner');
 const assisted=await f.call('submitOrder',f.payload,'owner','owner');
 assert.equal(assisted.source,'merchant-assist');assert.equal(assisted.total,1550);
 const guest=await f.call('submitOrder',{...f.payload,requestId:'guest-add',source:'merchant-assist'});
 assert.equal(guest.source,'table-code');assert.equal(guest.total,1250);assert.equal(guest.sessionId,assisted.sessionId);
 assert.deepEqual(f.bucket('sessions').get(f.sid).unsettledOrderIds,[assisted.id,guest.id]);
 await assert.rejects(f.call('submitOrder',{...f.payload,requestId:'revoked'},'owner','customer'),/FORBIDDEN/);
});

test('餐具纸巾确认后可改数量，首单按新数量收费且已提交后禁止改写',async()=>{
  const f=fixture();
  const selection={sessionId:f.sid,people:2,cutlery:2,napkins:1,cutleryPrice:100,napkinPrice:100};
  await f.call('setDining',selection);
  const updated=await f.call('setDining',{...selection,cutlery:3,napkins:0});
  assert.equal(updated.dining.cutlery,3);assert.equal(updated.dining.napkins,0);
  const first=await f.call('submitOrder',f.payload);
  assert.equal(first.dining.cutlery,3);assert.equal(first.dining.napkins,0);assert.equal(first.total,1550);
  await assert.rejects(f.call('setDining',{...selection,cutlery:1}),/DINING_ALREADY_CHARGED/);
});

test('待接单可修改菜品数量和备注，接单后不能修改或取消',async()=>{
 const f=fixture();const a=await f.call('submitOrder',f.payload);
 await assert.rejects(f.call('editCustomerOrder',{id:a.id,version:1,lines:f.payload.lines},'bob'),/FORBIDDEN/);
 const edited=await f.call('editCustomerOrder',{id:a.id,version:1,lines:[{dishId:'lamb',quantity:7,flavor:'不辣'}],note:'不要葱'});
 assert.equal(edited.total,1750);assert.equal(edited.items[0].quantity,7);assert.equal(edited.note,'不要葱');
 await assert.rejects(f.call('editCustomerOrder',{id:a.id,version:1,lines:f.payload.lines}),/VERSION_CONFLICT/);
 const accepted=await f.call('updateOrder',{id:a.id,version:edited.version,status:'accepted'},'owner','owner');
 await assert.rejects(f.call('editCustomerOrder',{id:a.id,version:accepted.version,lines:f.payload.lines}),/ORDER_NOT_EDITABLE/);
 await assert.rejects(f.call('cancelCustomerOrder',{id:a.id,version:accepted.version,status:'cancelled'}),/FORBIDDEN/);

});
test('整桌结算包含同桌多人的加单，有未完成订单时所有付款入口拒绝',async()=>{
 const f=fixture();
 const key=crypto.createHash('sha256').update(f.sid+':bob').digest('hex');
 f.bucket('session_members').set(key,{sessionId:f.sid,openid:'bob',active:true});
 const a=await f.call('submitOrder',f.payload);
 const b=await f.call('submitOrder',{...f.payload,requestId:'bob-order'},'bob');
 await assert.rejects(f.call('settleSession',{sessionId:f.sid},'eve'),/FORBIDDEN/);
 await assert.rejects(f.call('payDemo',{id:a.id}),/ORDERS_NOT_COMPLETED/);
 let bill=await f.call('getBill',{sessionId:f.sid});assert.equal(bill.total,2500);assert.equal(bill.unfinished,2);
 for(const order of [a,b]){
   const accepted=await f.call('updateOrder',{id:order.id,version:1,status:'accepted'},'owner','owner');
   await f.call('updateOrder',{id:order.id,version:accepted.version,status:'completed'},'owner','owner');
   if(order===a)await assert.rejects(f.call('settleSession',{sessionId:f.sid}),/ORDERS_NOT_COMPLETED/);
 }
 await assert.rejects(f.call('settleSession',{sessionId:f.sid,expectedTotal:1250}),/BILL_CHANGED/);
 await f.call('settleSession',{sessionId:f.sid,expectedTotal:2500});
 assert.equal(f.bucket('orders').get(a.id).demoPaid,true);assert.equal(f.bucket('orders').get(b.id).demoPaid,true);
 assert.deepEqual(f.bucket('sessions').get(f.sid).unsettledOrderIds,[]);
 assert.equal(f.bucket('sessions').get(f.sid).status,'closed');
 assert.equal(f.bucket('tables').get('table').currentSessionId,null);
 assert.ok((await f.call('orders'))[0].settledAt);
 await assert.rejects(f.call('getBill',{sessionId:f.sid}),/SESSION_CLOSED/);
 await assert.rejects(f.call('submitOrder',{...f.payload,requestId:'after-settlement'}),/SESSION_CLOSED/);
 await assert.rejects(f.call('submitOrder',{...f.payload,requestId:'after-settlement-bob'},'bob'),/SESSION_CLOSED/);
 await f.call('settleSession',{sessionId:f.sid});
});
test('修改首单餐具纸巾数量同步订单费用且后续加单不重复收费',async()=>{
 const f=fixture();const a=await f.call('submitOrder',f.payload);
 const edited=await f.call('editCustomerOrder',{id:a.id,version:1,lines:f.payload.lines,note:'',dining:{cutlery:2,napkins:1}});
 assert.equal(edited.total,1550);assert.equal(edited.dining.cutlery,2);
 const b=await f.call('submitOrder',{...f.payload,requestId:'add'});
 assert.equal(b.total,1250);assert.equal(b.dining.charged,false);
});

test('商家可修改待接单及制作中订单，顾客仍不能修改制作中订单',async()=>{
 const f=fixture();const order=await f.call('submitOrder',f.payload);
 const payload={id:order.id,version:1,lines:[{dishId:'lamb',flavor:'特辣',quantity:8}],note:'后厨：少盐，分两盘'};
 await assert.rejects(f.call('editMerchantOrder',payload),/FORBIDDEN/);
 const updated=await f.call('editMerchantOrder',payload,'owner','owner');
 assert.equal(updated.items[0].quantity,8);assert.equal(updated.items[0].flavor,'特辣');assert.equal(updated.total,2000);
 assert.equal(updated.note,'后厨：少盐，分两盘');
 const customer=(await f.call('orders'))[0];assert.equal(customer.note,updated.note);assert.equal(customer.total,2000);
 assert.equal(f.bucket('orders').get(order.id).submittedBy,'alice');
 await assert.rejects(f.call('editMerchantOrder',payload,'owner','owner'),/VERSION_CONFLICT/);
 const second=await f.call('editMerchantOrder',{...payload,version:updated.version,note:'后厨：少盐'},'staff','staff');
 const accepted=await f.call('updateOrder',{id:order.id,version:second.version,status:'accepted'},'owner','owner');
 await assert.rejects(f.call('editCustomerOrder',{...payload,version:accepted.version}),/ORDER_NOT_EDITABLE/);
 const making=await f.call('editMerchantOrder',{...payload,version:accepted.version,note:'制作中调整'},'owner','owner');
 assert.equal(making.status,'accepted');assert.equal(making.note,'制作中调整');
 assert.equal(making.version,accepted.version+1);
 const completed=await f.call('updateOrder',{id:order.id,version:making.version,status:'completed'},'owner','owner');
 await assert.rejects(f.call('editMerchantOrder',{...payload,version:completed.version},'owner','owner'),/ORDER_NOT_EDITABLE/);
});
test('商家修改只允许原订单菜品，并验证数量辣度及已取消状态',async()=>{
 const f=fixture();f.bucket('dishes').get('lamb').minQuantity=5;
 const order=await f.call('submitOrder',f.payload);
 const payload={id:order.id,version:1,lines:[{dishId:'lamb',flavor:'微辣',quantity:4}]};
 await assert.rejects(f.call('editMerchantOrder',payload,'owner','owner'),/INVALID_QUANTITY/);
 await assert.rejects(f.call('editMerchantOrder',{...payload,lines:[{dishId:'lamb',flavor:'乱填',quantity:5}]},'owner','owner'),/INVALID_FLAVOR/);
 await assert.rejects(f.call('editMerchantOrder',{...payload,lines:[{dishId:'new-dish',flavor:'标准',quantity:1}]},'owner','owner'),/ORDER_ITEMS_ONLY/);
 await f.call('cancelCustomerOrder',{id:order.id,version:1,status:'cancelled'});
 await assert.rejects(f.call('editMerchantOrder',payload,'owner','owner'),/ORDER_NOT_EDITABLE/);
});

test('已有订单后商品售罄，旧菜单发起新加单仍被云端拒绝',async()=>{
 const f=fixture();await f.call('submitOrder',f.payload);
 f.bucket('dishes').get('lamb').soldOut=true;
 await assert.rejects(f.call('submitOrder',{...f.payload,requestId:'sold-out-additional-order'}),/DISH_UNAVAILABLE/);
 assert.equal(f.bucket('orders').size,1);
});

test('商家可取消制作中订单，校验身份和版本并保留订单快照',async()=>{
 const f=fixture();const original=await f.call('submitOrder',f.payload);
 const accepted=await f.call('updateOrder',{id:original.id,version:1,status:'accepted'},'owner','owner');
 const payload={id:original.id,version:accepted.version,status:'cancelled'};
 await assert.rejects(f.call('cancelCustomerOrder',payload),/FORBIDDEN/);
 await assert.rejects(f.call('updateOrder',payload),/FORBIDDEN/);
 await assert.rejects(f.call('updateOrder',{...payload,version:1},'staff','staff'),/VERSION_CONFLICT/);
 const cancelled=await f.call('updateOrder',payload,'staff','staff');
 assert.equal(cancelled.status,'cancelled');assert.deepEqual(cancelled.items,original.items);
 assert.equal(cancelled.total,original.total);assert.deepEqual(f.bucket('sessions').get(f.sid).unsettledOrderIds,[]);
});

test('顾客结清原子清空旧购物车并阻止旧会话继续下单，重试不影响新会话',async()=>{
 const f=fixture();const a=await f.call('submitOrder',f.payload);
 const b=await f.call('updateOrder',{id:a.id,version:a.version,status:'accepted'},'owner','owner');
 await f.call('updateOrder',{id:a.id,version:b.version,status:'completed'},'owner','owner');
 f.bucket('carts').set(f.sid,{lines:[{dishId:'lamb',quantity:5,flavor:'微辣'}],version:1});
 await f.call('settleSession',{sessionId:f.sid,expectedTotal:1250});
 assert.deepEqual(f.bucket('carts').get(f.sid).lines,[]);
 assert.equal(f.bucket('sessions').get(f.sid).status,'closed');
 const next='b'.repeat(32);f.bucket('tables').get('table').currentSessionId=next;
 await f.call('settleSession',{sessionId:f.sid,expectedTotal:1250});
 assert.equal(f.bucket('tables').get('table').currentSessionId,next);
 await assert.rejects(f.call('submitOrder',{...f.payload,requestId:'old-customer'}),/SESSION_CLOSED/);
});
