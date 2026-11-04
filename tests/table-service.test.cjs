const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createService } = require('../cloudfunctions/table-service/service');
function fixture() {
  const collections = new Map(); let token, n = 0;
  const bucket = name => { if (!collections.has(name)) collections.set(name, new Map()); return collections.get(name); };
  const collection = name => ({
    doc(id) { return {
      async get() { return { data: bucket(name).has(id) ? structuredClone({ ...bucket(name).get(id), _id: id }) : null }; },
      async set({ data }) { bucket(name).set(id, structuredClone(data)); },
      async update({ data }) { assert(bucket(name).has(id)); Object.assign(bucket(name).get(id), structuredClone(data)); }
    }; },
    where(filter) {
      let skip = 0, limit = 100;
      return { orderBy() { return this; }, skip(v) { skip = v; return this; }, limit(v) { limit = v; return this; }, async get() { return { data: [...bucket(name)].map(([id, v]) => ({ ...v, _id: id })).filter(v => Object.entries(filter).every(([k, x]) => v[k] === x)).slice(skip, skip + limit) }; } };
    }
  });
  const db = { collection, async runTransaction(fn) {
    const before = structuredClone(collections);
    try { return await fn({ collection(name) { return { doc: collection(name).doc }; } }); }
    catch(e) { collections.clear(); for (const [k,v] of before) collections.set(k,v); throw e; }
  } };
  bucket('stores').set('store', { storeId: 'charcoal-demo', appId: 'wx7dc3e02ff34b0133', active: true });
  bucket('store_members').set('owner', { storeId: 'charcoal-demo', appId: 'wx7dc3e02ff34b0133', openid: 'owner', role: 'owner', active: true });
  const cloud = { database: () => db, openapi: { wxacode: { async getUnlimited(p) { token = p.scene; assert.equal(token.length,22); return { buffer: Buffer.from('image') }; } } }, async uploadFile() { return { fileID: 'cloud://code-' + ++n }; }, async deleteFile() {} };
  const service = createService(cloud);
  const call = (event, user = 'owner', app = 'wx7dc3e02ff34b0133') => service(event, { OPENID: user, APPID: app });
  return { call, bucket, token: () => token };
}
test('顾客和伪造跨App上下文不能管理桌台', async () => {
  const f=fixture();
  assert.equal((await f.call({action:'add',name:'A06',role:'owner'},'guest')).ok,false);
  assert.equal((await f.call({action:'list'},'owner','other')).ok,false);
  assert.equal((await f.call({action:'join',token:'bad'},'guest')).ok,false);
});
test('商家选桌与顾客扫码共用会话，空桌自动开桌且不依赖桌码启用', async () => {
  const f = fixture();
  await f.call({action:'add',name:'A08'});
  const tableId = (await f.call({action:'list'})).tables[0].id;
  assert.equal((await f.call({action:'merchantJoin',tableId},'guest')).ok,false);
  const first = await f.call({action:'merchantJoin',tableId});
  assert.equal(first.ok,true);
  assert.equal(f.bucket('carts').get(first.binding.sessionId).lines.length,0);
  assert.equal([...f.bucket('session_members').values()][0].source,'merchant-assist');
  assert.equal((await f.call({action:'binding',sessionId:first.binding.sessionId})).ok,true);
  await f.call({action:'code',tableId});
  const guest = await f.call({action:'join',token:f.token()},'alice');
  assert.equal(guest.binding.sessionId,first.binding.sessionId);
  await f.call({action:'setQrEnabled',tableId,enabled:false});
  const again = await f.call({action:'merchantJoin',tableId});
  assert.equal(again.binding.sessionId,first.binding.sessionId);
  assert.equal((await f.call({action:'join',token:f.token()},'bob')).ok,false);
  await f.call({action:'close',tableId});
  assert.equal((await f.call({action:'binding',sessionId:first.binding.sessionId})).ok,false);
  const next = await f.call({action:'merchantJoin',tableId});
  assert.notEqual(next.binding.sessionId,first.binding.sessionId);
});
test('一桌一码：两人加入同一会话，关桌撤销权限，下一桌创建全新会话', async () => {
  const f=fixture();
  assert.equal((await f.call({action:'add',name:'A06'})).ok,true);
  assert.equal((await f.call({action:'add',name:'a06'})).ok,false);
  const tableId=(await f.call({action:'list'})).tables[0].id;
  assert.equal((await f.call({action:'code',tableId,version:'trial'})).ok,true);
  const token=f.token();
  const a=await f.call({action:'join',token},'alice'); assert.equal(a.ok,true);
  const b=await f.call({action:'join',token},'bob'); assert.equal(b.binding.sessionId,a.binding.sessionId);
  assert.equal((await f.call({action:'binding',sessionId:a.binding.sessionId},'mallory')).ok,false);
  assert.equal((await f.call({action:'remove',tableId})).ok,false);
  assert.equal((await f.call({action:'close',tableId})).ok,true);
  assert.equal((await f.call({action:'binding',sessionId:a.binding.sessionId},'alice')).ok,false);
  const c=await f.call({action:'join',token},'charlie'); assert.notEqual(c.binding.sessionId,a.binding.sessionId);
  assert.equal(f.bucket('carts').get(c.binding.sessionId).lines.length,0);
});
test('固定正式码：查看、重复生成和重置参数均不换码，只有删除才作废', async () => {
  const f=fixture();await f.call({action:'add',name:'A06'});
  const tableId=(await f.call({action:'list'})).tables[0].id;
  const first=await f.call({action:'code',tableId});const token=f.token();
  for(const params of [{},{reset:true},{version:'trial'}]) {
    assert.equal((await f.call({action:'code',tableId,...params})).fileID,first.fileID);
  }
  assert.equal((await f.call({action:'list'})).tables[0].codeFileID,first.fileID);
  assert(!JSON.stringify(f.bucket('tables').get(tableId)).includes(token));
  await f.call({action:'remove',tableId});
  assert.equal((await f.call({action:'join',token},'alice')).ok,false);
  await f.call({action:'add',name:'A06'});await f.call({action:'code',tableId});
  assert.notEqual(f.token(),token);
  assert.equal((await f.call({action:'join',token},'alice')).ok,false);
});
test('批量A01至A30重复生成保持所有桌码，兼容已有桌台ID', async () => {
  const f=fixture();
  f.bucket('tables').set('table-a01',{name:'A01',active:true,qrVersion:0,qrTokenHash:'',currentSessionId:null});
  for(let i=1;i<=30;i++) await f.call({action:'add',name:'A'+String(i).padStart(2,'0')});
  const tables=(await f.call({action:'list'})).tables;assert.equal(tables.length,30);
  const files=new Map();
  for(const t of tables) files.set(t.id,(await f.call({action:'code',tableId:t.id})).fileID);
  for(const t of tables) assert.equal((await f.call({action:'code',tableId:t.id})).fileID,files.get(t.id));
});
test('非空购物车或已有云端订单阻止关桌', async () => {
  const f=fixture();await f.call({action:'add',name:'A06'});
  const tableId=(await f.call({action:'list'})).tables[0].id;
  await f.call({action:'code',tableId});const a=await f.call({action:'join',token:f.token()},'alice');
  f.bucket('carts').get(a.binding.sessionId).lines=[{dishId:'dish',quantity:1}];
  assert.equal((await f.call({action:'close',tableId})).ok,false);
  f.bucket('carts').get(a.binding.sessionId).lines=[];
  f.bucket('orders').set('order',{sessionId:a.binding.sessionId});
  f.bucket('sessions').get(a.binding.sessionId).unsettledOrderIds=['order'];
  assert.equal((await f.call({action:'close',tableId})).ok,false);
});
test('停用桌码阻止新扫码，启用后恢复且不换码，进行中会话不受影响', async () => {
  const f=fixture();
  await f.call({action:'add',name:'A06'});
  const tableId=(await f.call({action:'list'})).tables[0].id;
  assert.equal((await f.call({action:'code',tableId})).ok,true);
  const token=f.token();
  const a=await f.call({action:'join',token},'alice'); assert.equal(a.ok,true);
  assert.equal((await f.call({action:'setQrEnabled',tableId,enabled:false})).ok,true);
  assert.equal((await f.call({action:'list'})).tables[0].qrEnabled,false);
  assert.equal((await f.call({action:'join',token},'bob')).ok,false);
  assert.equal((await f.call({action:'binding',sessionId:a.binding.sessionId},'alice')).ok,true);
  assert.equal((await f.call({action:'setQrEnabled',tableId,enabled:true})).ok,true);
  assert.equal((await f.call({action:'list'})).tables[0].qrEnabled,true);
  const b=await f.call({action:'join',token},'bob'); assert.equal(b.ok,true);
  assert.equal(b.binding.sessionId,a.binding.sessionId);
  assert.equal((await f.call({action:'setQrEnabled',tableId,enabled:false},'guest')).ok,false);
});

test('结束用餐必须匹配正在查看的会话，防止误结束下一桌客人',async()=>{
 const f=fixture();await f.call({action:'add',name:'A06'});
 const tableId=(await f.call({action:'list'})).tables[0].id;
 const joined=await f.call({action:'merchantJoin',tableId});assert.equal(joined.ok,true);
 const wrong=await f.call({action:'close',tableId,sessionId:'previous-session'});
 assert.equal(wrong.ok,false);assert.match(wrong.message,/用餐会话已变化/);
 assert.equal(f.bucket('tables').get(tableId).currentSessionId,joined.binding.sessionId);
 const done=await f.call({action:'close',tableId,sessionId:joined.binding.sessionId});
 assert.equal(done.ok,true);assert.equal(f.bucket('tables').get(tableId).currentSessionId,null);
});

test('商家确认结清后原子结账关桌，金额变化或未完成时拒绝',async()=>{
 const f=fixture();await f.call({action:'add',name:'A06'});
 const tableId=(await f.call({action:'list'})).tables[0].id;
 const {binding}=await f.call({action:'merchantJoin',tableId});const sid=binding.sessionId;
 f.bucket('sessions').get(sid).unsettledOrderIds=['o1'];
 f.bucket('orders').set('o1',{sessionId:sid,tableId,status:'pending',total:1250,paymentStatus:'unpaid',version:1});
 const event={action:'close',tableId,sessionId:sid,confirmSettlement:true,expectedTotal:1250};
 assert.equal((await f.call(event,'guest')).ok,false);
 assert.equal((await f.call(event)).ok,false);
 f.bucket('orders').get('o1').status='completed';
 assert.equal((await f.call({...event,expectedTotal:1000})).ok,false);
 f.bucket('carts').get(sid).lines=[{dishId:'dish',quantity:1}];
 assert.equal((await f.call(event)).ok,false);assert(!f.bucket('orders').get('o1').demoPaid);
 f.bucket('carts').get(sid).lines=[];
 assert.equal((await f.call(event)).ok,true);
 assert.equal(f.bucket('orders').get('o1').demoPaid,true);
 assert.equal(f.bucket('tables').get(tableId).currentSessionId,null);
 assert.deepEqual(f.bucket('sessions').get(sid).unsettledOrderIds,[]);
});
