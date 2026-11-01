'use strict';
const crypto = require('node:crypto');
const createStore = require('./engine');
const { resolveIdentity } = require('./access');
const merchantActions = new Set(['saveDish','deleteDish','setDishStatus','saveCategory','deleteCategory','moveCategory','setCategoryStatus','cancelMerchantOrder']);
const orderActions = new Set(['updateOrder','payDemo','cancelMerchantOrder']);
const cleanOrder = o => { const { _id, submittedBy, storeId, appId, ...order } = o; return order; };
const docData = result => Array.isArray(result.data) ? result.data[0] : result.data;
function createService(db, context) {
 return async event => {
  try {
   const { storeId, action, args = [], requestId, revision } = event || {};
   const ctx = context(), identity = await resolveIdentity(db, ctx, storeId);
   const merchant = ['owner','staff'].includes(identity.role);
   const key = `${ctx.APPID}_${storeId}`;
   const catalogRef = db.collection('business_catalog').doc(key);
   if (action === 'read') {
    const catalog = docData(await catalogRef.get());
    if (!catalog) return { ok:false, code:'NOT_INITIALIZED', merchant };
    let query = db.collection('business_orders').where({ storeId, appId:ctx.APPID, ...(merchant ? {} : { submittedBy:ctx.OPENID }) });
    // Fetch pages rather than silently truncating a store's history.
    const orders = [];
    for (let skip=0;;skip+=100) {
     const page = await query.orderBy('createdAt','desc').skip(skip).limit(100).get();
     orders.push(...page.data.map(cleanOrder)); if (page.data.length < 100) break;
    }
    return { ok:true, revision:catalog.revision, state:{ ...catalog.state, orders } };
   }
   if (!Array.isArray(args) || args.length > 3 || typeof requestId !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(requestId)) throw new Error('请求参数无效');
   if (merchantActions.has(action) || action === 'bootstrap') { if (!merchant) throw new Error('无门店管理权限'); }
   else if (!['submitOrder','updateOrder','payDemo'].includes(action)) throw new Error('未知操作');
   const receiptId = crypto.createHash('sha256').update(key + ctx.OPENID + requestId).digest('hex');
   const result = await db.runTransaction(async tx => {
    const receiptRef = tx.collection('business_requests').doc(receiptId);
    const receipt = docData(await receiptRef.get()); if (receipt) return receipt.result;
    const ref = tx.collection('business_catalog').doc(key);
    const catalog = docData(await ref.get());
    if (action === 'bootstrap') {
     if (catalog) return null; // Never overwrite an existing cloud menu.
     const input = args[0];
     if (!input || !Array.isArray(input.categories) || !Array.isArray(input.dishes) || input.categories.length > 50 || input.dishes.length > 300) throw new Error('菜单数据无效');
     const engine = createStore(); engine.reset(); const state = engine.read(); state.categories=[];state.dishes=[];state.orders=[];state.cart=[];
     const check = createStore(state);
     for (const c of input.categories) {
      if (!c || typeof c.id !== 'string' || !/^[\w-]{1,100}$/.test(c.id) || check.read().categories.some(x=>x.id===c.id)) throw new Error('分区标识无效');
      check.saveCategory(null,c.name); const s=check.read();s.categories[s.categories.length-1]={id:c.id,name:c.name.trim(),onSale:c.onSale!==false};
      // Recreate closure with validated category IDs below.
      state.categories=s.categories;
      Object.assign(check,createStore(state));
     }
     for (const dish of input.dishes) check.saveDish(validateDish(dish));
     const saved=check.read(); saved.cart=[];saved.orders=[];
     await ref.set({data:{state:saved,revision:1,updatedAt:Date.now()}});
     await receiptRef.set({data:{result:null,createdAt:Date.now()}}); return null;
    }
    if (!catalog) throw new Error('云端菜单尚未初始化');
    if (!orderActions.has(action) && action !== 'submitOrder' && revision !== catalog.revision) throw new Error('菜单已被其他设备更新，请刷新后重试');
    const state = { ...catalog.state, orders:[], cart:[] };
    let existing;
    if (orderActions.has(action)) {
     if (typeof args[0] !== 'string' || !/^[\w-]{1,100}$/.test(args[0])) throw new Error('订单标识无效');
     existing = docData(await tx.collection('business_orders').doc(args[0]).get());
     if (!existing || existing.storeId !== storeId || existing.appId !== ctx.APPID || (!merchant && existing.submittedBy !== ctx.OPENID)) throw new Error('无权访问此订单');
     if (!merchant && action === 'updateOrder' && (args[1] !== 'cancelled' || existing.status !== 'pending')) throw new Error('无权修改订单状态');
     state.orders=[cleanOrder(existing)];
    }
    const engine = createStore(state); let result = null;
    if (action === 'submitOrder') {
     const input=args[0];
     if (!input || !Array.isArray(input.cart) || !input.cart.length || input.cart.length>50 || !state.tables.some(t=>t.name===input.table)) throw new Error('菜品或桌号无效');
     const unique = new Set();
     const table=state.tables.find(t=>t.name===input.table);engine.selectDemoTable(table.id);
     for (const line of input.cart) {
      if (!line || !['标准','不辣','微辣','中辣','特辣'].includes(line.flavor) || !Number.isInteger(line.quantity) || line.quantity<1 || line.quantity>99 || unique.has(`${line.dishId}:${line.flavor}`)) throw new Error('购物车数据无效');
      unique.add(`${line.dishId}:${line.flavor}`); engine.changeCart(line.dishId,line.flavor,line.quantity);
     }
     result=engine.submitOrder(String(input.note||''));
     result.id = 'order-' + receiptId;
     await tx.collection('business_orders').doc(result.id).set({data:{...result,submittedBy:ctx.OPENID,storeId,appId:ctx.APPID}});
    } else {
     if (action==='setDishStatus' && !['onSale','soldOut'].includes(args[1])) throw new Error('菜品状态无效');
     if (action==='moveCategory' && ![-1,1].includes(args[1])) throw new Error('排序参数无效');
     if (action==='saveDish') args[0]=validateDish(args[0]);
     engine[action](...args);
     if (existing) await tx.collection('business_orders').doc(args[0]).set({data:{...existing,...engine.read().orders[0]}});
    }
    if (!existing) {
     const next=engine.read(); next.orders=[];next.cart=[];
     if(next.dishes.length>300 || next.categories.length>50) throw new Error('菜单数量已达上限');
     await ref.set({data:{state:next,revision:catalog.revision+1,updatedAt:Date.now()}});
    }
    await receiptRef.set({data:{result,createdAt:Date.now()}}); return result;
   });
   return {ok:true,result};
  } catch (error) { return {ok:false,code:'BUSINESS_ERROR',message:error.message || '云端操作失败'}; }
 };
}
function validateDish(d) {
 if (!d || typeof d.id!=='string' || !/^[\w-]{1,100}$/.test(d.id)) throw new Error('菜品标识无效');
 for(const k of ['name','categoryId','unit','description','tag','image']) if(typeof d[k]!=='string' || d[k].length>500) throw new Error('菜品字段无效');
 if(!d.image.startsWith('/assets/') && !d.image.startsWith('cloud://')) throw new Error('请先将菜品图片上传云端');
 return {id:d.id,categoryId:d.categoryId,name:d.name,unit:d.unit,description:d.description,tag:d.tag,image:d.image,price:d.price,onSale:!!d.onSale,soldOut:!!d.soldOut,spicy:!!d.spicy};
}
module.exports={createService};
