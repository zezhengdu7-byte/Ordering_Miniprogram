'use strict';
const { feeSettings, createDining, chargeDining } = require('./dining');
const crypto = require('crypto');
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
const check = (condition, code) => { if (!condition) throw new Error(code); };
const text = (value, max, code, empty = false) => {
  check(typeof value === 'string', code); const v = value.trim();
  check(v.length <= max && (empty || v.length > 0), code); return v;
};
async function get(db, collection, id) {
  check(typeof id === 'string' && id.length > 0 && id.length <= 100, 'INVALID_ID');
  try {
    const result = await db.collection(collection).doc(id).get();
    return Array.isArray(result.data) ? result.data[0] || null : result.data || null;
  } catch (error) {
    if (/DOCUMENT_NOT_EXIST|DOCUMENT_NOT_FOUND|document.*(not exist|does not exist|not found)/i.test(error.message || error.errMsg || '')) return null;
    throw error;
  }
}
async function all(db, collection, filter = {}) {
  const result = []; let page;
  do {
    page = (await db.collection(collection).where(filter).orderBy('_id', 'asc').skip(result.length).limit(100).get()).data;
    result.push(...page); check(result.length <= 5000, 'TOO_MANY_RECORDS');
  } while (page.length === 100);
  return result;
}
function publicOrder(o) {
  return { id:o._id,number:o.number,table:o.tableName,createdAt:o.createdAt,version:o.version,
    items:o.items.map(i=>({name:i.name,unit:i.unit,price:i.unitPrice,quantity:i.quantity,flavor:i.flavor})),
    dining:o.dining || null,foodTotal:o.foodTotal ?? o.total,total:o.total,note:o.note,status:o.status,paid:o.demoPaid === true,paymentStatus:o.paymentStatus,paymentMode:'demo' };
}
function createService(db, context, identity, validators) {
  const merchant = ['owner','staff'].includes(identity.role);
  const requireMerchant = () => check(merchant,'FORBIDDEN');
  async function store(source=db) {
    const r=await source.collection('stores').where({storeId:'charcoal-demo',appId:'wx7dc3e02ff34b0133',active:true}).limit(1).get();
    check(r.data.length,'STORE_UNAVAILABLE');return r.data[0];
  }
  async function lock(tx, expected) {
    const meta=await get(tx,'catalog_meta','menu');check(meta,'NOT_INITIALIZED');
    if (expected !== undefined) validators.assertVersion(meta.version, expected);
    await tx.collection('catalog_meta').doc('menu').update({data:{version:meta.version+1,updatedAt:Date.now()}});
  }
  async function snapshot() {
    requireMerchant();
    const [s,categories,dishes,tables,printers,meta]=await Promise.all([store(),all(db,'categories',{active:true}),all(db,'dishes',{active:true}),all(db,'tables',{active:true}),all(db,'printers',{active:true}),get(db,'catalog_meta','menu')]);
    return format(s,categories,dishes,tables,printers,meta);
  }
  function format(s,categories,dishes,tables,printers,meta) {
    const sort=(a,b)=>a.sort-b.sort||a._id.localeCompare(b._id);
    return {version:meta?.version||0,shop:{name:s.name,welcome:s.welcome,open:s.open,cutleryPrice:s.cutleryPrice??null,napkinPrice:s.napkinPrice??null},
      categories:categories.sort(sort).map(c=>({id:c._id,name:c.name,onSale:c.onSale!==false})),
      dishes:dishes.sort(sort).map(d=>({id:d._id,categoryId:d.categoryId,name:d.name,description:d.description,price:d.price,unit:d.unit,image:d.imageFileId,onSale:d.onSale,soldOut:d.soldOut,spicy:d.spicy,tag:d.tag,version:d.version})),
      tables:tables.map(t=>({id:t._id,name:t.name})),...(printers.length?{printer:{name:printers[0].name,serial:printers[0].serial,copies:printers[0].copies,autoPrint:printers[0].autoPrint}}:{})};
  }
  async function catalog() {
    const [s,categories,dishes,tables,meta]=await Promise.all([store(),all(db,'categories',{active:true}),all(db,'dishes',{active:true}),all(db,'tables',{active:true}),get(db,'catalog_meta','menu')]);
    // Returning sale state lets cached cart lines be removed without trusting stale availability.
    return format(s,categories,dishes,tables,[],meta);
  }
  async function mutate(e) {
    requireMerchant();
    const before = await get(db,'catalog_meta','menu'); check(before,'NOT_INITIALIZED');
    if(e.expectedVersion !== undefined) validators.assertVersion(before.version,e.expectedVersion);
    const storeDoc = await store();
    const catsBefore = await all(db,'categories',{active:true});
    const tablesBefore = await all(db,'tables',{active:true});
    const p0 = e.payload || {};
    const categoryDishes = e.action === 'deleteCategory' ? await all(db,'dishes',{categoryId:p0.id,active:true}) : [];
    const pendingOrders = ['saveTable','deleteTable'].includes(e.action) && p0.id ? await all(db,'orders',{tableId:p0.id,status:db.command.in(['pending','accepted'])}) : [];
    await db.runTransaction(async tx=>{
      await lock(tx,before.version);
      const now=Date.now(), p=e.payload||{}, action=e.action;
      if (action==='saveDish') {
        const d=p.dish||{};const id=text(d.id,80,'INVALID_DISH');
        const category=await get(tx,'categories',d.categoryId);check(category?.active,'INVALID_CATEGORY');
        check(Number.isSafeInteger(d.price)&&d.price>=1&&d.price<=9999900,'INVALID_PRICE');
        const file=text(d.image,1024,'INVALID_IMAGE');
        check(file.startsWith('cloud://cloud1-d0g5igvuk85096f8a.'),'INVALID_IMAGE');
        const old=await get(tx,'dishes',id);
        const doc={categoryId:d.categoryId,name:text(d.name,24,'INVALID_NAME'),description:text(d.description,160,'INVALID_DESCRIPTION',true),price:d.price,unit:text(d.unit,12,'INVALID_UNIT'),imageFileId:file,onSale:!!d.onSale,soldOut:!!d.soldOut,spicy:!!d.spicy,tag:text(d.tag,24,'INVALID_TAG',true),sort:old?.sort??now,active:true,version:(old?.version||0)+1,createdAt:old?.createdAt||now,updatedAt:now};
        await tx.collection('dishes').doc(id).set({data:doc});
      } else if (action==='setDishStatus'||action==='deleteDish') {
        const d=await get(tx,'dishes',p.id);check(d?.active,'DISH_UNAVAILABLE');
        check(action==='deleteDish'||['onSale','soldOut'].includes(p.field),'INVALID_FIELD');
        await tx.collection('dishes').doc(d._id).update({data:{...(action==='deleteDish'?{active:false}:{[p.field]:!d[p.field]}),version:d.version+1,updatedAt:now}});
      } else if (action==='saveCategory') {
        const name=text(p.name,12,'INVALID_NAME');const cats=catsBefore;
        check(!cats.some(c=>c.name===name&&c._id!==p.id),'DUPLICATE_NAME');
        const old=p.id?await get(tx,'categories',p.id):null;check(!p.id||old?.active,'INVALID_CATEGORY');
        await tx.collection('categories').doc(p.id||`cat-${crypto.randomBytes(12).toString('hex')}`).set({data:{name,sort:old?.sort??Math.max(0,...cats.map(c=>c.sort))+1,onSale:old?.onSale!==false,active:true,createdAt:old?.createdAt||now,updatedAt:now}});
      } else if (['deleteCategory','setCategoryStatus','moveCategory'].includes(action)) {
        const cat=await get(tx,'categories',p.id);check(cat?.active,'INVALID_CATEGORY');
        if(action==='deleteCategory'){
          check(!categoryDishes.length,'CATEGORY_NOT_EMPTY');
          await tx.collection('categories').doc(p.id).update({data:{active:false,updatedAt:now}});
        } else if(action==='setCategoryStatus') await tx.collection('categories').doc(p.id).update({data:{onSale:cat.onSale===false,updatedAt:now}});
        else {
          check(p.direction===1||p.direction===-1,'INVALID_DIRECTION');
          const cats=catsBefore.slice().sort((a,b)=>a.sort-b.sort||a._id.localeCompare(b._id));
          const i=cats.findIndex(c=>c._id===p.id),other=cats[i+p.direction];
          if(other){await tx.collection('categories').doc(cat._id).update({data:{sort:other.sort,updatedAt:now}});await tx.collection('categories').doc(other._id).update({data:{sort:cat.sort,updatedAt:now}});}
        }
      } else if(action==='saveShop') {
        const s=await get(tx,'stores',storeDoc._id),shop=p.shop||{};
        check(feeSettings(shop).configured,'INVALID_FEE');
        await tx.collection('stores').doc(s._id).update({data:{name:text(shop.name,20,'INVALID_NAME'),welcome:text(shop.welcome,48,'INVALID_WELCOME'),open:!!shop.open,cutleryPrice:shop.cutleryPrice,napkinPrice:shop.napkinPrice,updatedAt:now}});
      } else if(action==='saveTable'||action==='deleteTable') {
        const tables=tablesBefore;const old=p.id?await get(tx,'tables',p.id):null;check(!p.id||old?.active,'INVALID_TABLE');
        if(old){check(!pendingOrders.length&&!old.currentSessionId,'TABLE_BUSY');}
        if(action==='deleteTable'){check(tables.length>1,'LAST_TABLE');await tx.collection('tables').doc(p.id).update({data:{active:false,updatedAt:now}});}
        else {const name=text(p.name,12,'INVALID_NAME').toUpperCase();check(/^[A-Z0-9\u4e00-\u9fa5-]+$/.test(name),'INVALID_NAME');check(!tables.some(t=>t.name===name&&t._id!==p.id),'DUPLICATE_NAME');await tx.collection('tables').doc(p.id||`table-${crypto.randomBytes(12).toString('hex')}`).set({data:{name,active:true,qrTokenHash:old?.qrTokenHash||'',qrVersion:old?.qrVersion||0,currentSessionId:null,createdAt:old?.createdAt||now,updatedAt:now}});}
      } else if(action==='savePrinter') {
        const p1=p.printer||{};check([1,2,3].includes(p1.copies),'INVALID_COPIES');
        await tx.collection('printers').doc('kitchen').set({data:{name:text(p1.name,20,'INVALID_NAME'),serial:text(p1.serial,40,'INVALID_SERIAL',true),provider:'demo',copies:p1.copies,autoPrint:!!p1.autoPrint,active:true,createdAt:now,updatedAt:now}});
      } else throw new Error('UNKNOWN_ACTION');
    });
    return snapshot();
  }
  async function dining(e) {
    const p=e.payload||{}, storeDoc=await store();
    return db.runTransaction(async tx=>{
      const session=await get(tx,'sessions',p.sessionId);
      const member=await get(tx,'session_members',hash(p.sessionId+':'+context.OPENID));
      check(session?.status==='open','SESSION_CLOSED');check(member?.active,'FORBIDDEN');
      const table=await get(tx,'tables',session.tableId);
      check(table?.active&&table.currentSessionId===session._id,'SESSION_CLOSED');
      const shop=await get(tx,'stores',storeDoc._id);
      if(e.action==='setDining'&&!session.dining?.confirmed) {
        const value=createDining(p,shop);
        await tx.collection('sessions').doc(session._id).update({data:{dining:value,updatedAt:Date.now()}});
        return { dining:value,fees:feeSettings(shop),charged:false };
      }
      return {dining:session.dining||null,fees:feeSettings(shop),charged:!!session.diningFeeOrderId};
    });
  }
  async function submit(e) {
    const p=e.payload||{}; const requestId=text(p.requestId,100,'INVALID_REQUEST');
    const id=hash(context.OPENID+':'+requestId);
    const fingerprint=hash(JSON.stringify({lines:p.lines,note:p.note,tableId:p.tableId,sessionId:p.sessionId}));
    const storeDoc = await store();
    const doc=await db.runTransaction(async tx=>{
      const previous=await get(tx,'orders',id);
      if(previous){check(previous.requestHash===fingerprint,'REQUEST_REUSED');return previous;}
      const s=await get(tx,'stores',storeDoc._id);check(s?.active&&s.open,'STORE_CLOSED');
      // This revision document serializes menu edits, submissions and table renames in one store.
      await lock(tx);
      const table=await get(tx,'tables',p.tableId);check(table?.active,'INVALID_TABLE');
      check(typeof p.sessionId==='string' && /^[a-f0-9]{32}$/.test(p.sessionId),'SESSION_REQUIRED');
      const session=await get(tx,'sessions',p.sessionId);
      const member=await get(tx,'session_members',hash(p.sessionId+':'+context.OPENID));
      check(session?.status==='open' && session.tableId===table._id && table.currentSessionId===session._id,'SESSION_CLOSED');
      check(member?.active && member.sessionId===session._id && member.openid===context.OPENID,'FORBIDDEN');
      const ids=[...new Set((Array.isArray(p.lines)?p.lines:[]).map(l=>l.dishId))];
      check(ids.length<=50,'INVALID_CART');
      const dishes=await Promise.all(ids.map(i=>get(tx,'dishes',i)));
      const categoryIds=[...new Set(dishes.filter(Boolean).map(d=>d.categoryId))];
      check(ids.length+categoryIds.length<=80,'INVALID_CART');
      const categories=await Promise.all(categoryIds.map(i=>get(tx,'categories',i)));
      check(categories.every(c=>c?.active&&c.onSale!==false),'DISH_UNAVAILABLE');
      const priced=validators.priceOrder(p.lines,dishes.filter(Boolean));
      const dining=chargeDining(session);
      const now=Date.now();
      const o={_id:id,sessionId:session._id,tableId:table._id,tableName:table.name,tableValidated:true,source:'table-code',submittedBy:context.OPENID,requestId,requestHash:fingerprint,cartVersion:null,number:`O${id}`,businessDate:new Date(now+8*3600000).toISOString().slice(0,10),...priced,foodTotal:priced.total,dining,total:priced.total+dining.total,note:text(p.note||'',100,'INVALID_NOTE',true),status:'pending',paymentStatus:'unpaid',paymentMode:'demo',demoPaid:false,activePaymentId:null,paidPaymentId:null,acceptedAt:null,completedAt:null,cancelledAt:null,version:1,createdAt:now,updatedAt:now};
      const {_id,...data}=o;await tx.collection('orders').doc(id).set({data});
      await tx.collection('sessions').doc(session._id).update({data:{unsettledOrderIds:[...new Set([...(session.unsettledOrderIds||[]),id])],diningFeeOrderId:session.diningFeeOrderId||id,updatedAt:now}});
      return o;
    });
    return publicOrder(doc);
  }
  async function orders(e) {
    const mode=e.payload?.merchant===true;if(mode)requireMerchant();
    const rows=await all(db,'orders',mode?{}:{submittedBy:context.OPENID});
    return rows.sort((a,b)=>b.createdAt-a.createdAt||b._id.localeCompare(a._id)).map(publicOrder);
  }
  async function orderAction(e) {
    const p=e.payload||{};text(p.id,100,'INVALID_ORDER');
    return db.runTransaction(async tx=>{
      const o=await get(tx,'orders',p.id);check(o,'INVALID_ORDER');
      if(e.action==='payDemo'){
        check(o.submittedBy===context.OPENID,'FORBIDDEN');check(o.status!=='cancelled','INVALID_ORDER_TRANSITION');
        if(o.demoPaid)return publicOrder(o);
      } else {
        const ownerCancel=p.status==='cancelled'&&e.action==='cancelCustomerOrder';
        if(ownerCancel)check(o.submittedBy===context.OPENID&&o.status==='pending'&&!o.demoPaid,'FORBIDDEN');
        else requireMerchant();
        validators.assertVersion(o.version,p.version);
        const transitions={pending:['accepted','cancelled'],accepted:['completed','cancelled'],completed:[],cancelled:[]};
        check(transitions[o.status].includes(p.status),'INVALID_ORDER_TRANSITION');
        if(p.status==='cancelled')check(o.paymentStatus==='unpaid'&&!o.activePaymentId&&!o.paidPaymentId,'PAYMENT_MUST_BE_CLOSED');
      }
      const now=Date.now();
      const patch=e.action==='payDemo'?{demoPaid:true}:{status:p.status,[{accepted:'acceptedAt',completed:'completedAt',cancelled:'cancelledAt'}[p.status]]:now};
      Object.assign(o,patch,{version:o.version+1,updatedAt:now});
      await tx.collection('orders').doc(o._id).update({data:{...patch,version:o.version,updatedAt:now}});
      if(o.sessionId){
        const session=await get(tx,'sessions',o.sessionId);check(session,'SESSION_CLOSED');
        const settled=o.status==='cancelled'||(o.status==='completed'&&(o.demoPaid||o.paymentStatus==='paid'));
        const ids=new Set(session.unsettledOrderIds||[]);if(settled)ids.delete(o._id);else ids.add(o._id);
        await tx.collection('sessions').doc(session._id).update({data:{unsettledOrderIds:[...ids],...(o.status==='cancelled'&&session.diningFeeOrderId===o._id?{diningFeeOrderId:null}:{}),updatedAt:now}});
      }
      return publicOrder(o);
    });
  }
  return {dispatch:async e=>{
    check(typeof e.action==='string','UNKNOWN_ACTION');
    if(e.action==='catalog')return catalog();
    if(e.action==='snapshot')return snapshot();
    if(e.action==='orders')return orders(e);
    if(['getDining','setDining'].includes(e.action))return dining(e);
    if(e.action==='submitOrder')return submit(e);
    if(['payDemo','updateOrder','cancelCustomerOrder'].includes(e.action))return orderAction(e);
    return mutate(e);
  }};
}
module.exports={createService,publicOrder,all,get};
