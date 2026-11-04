const {test,beforeEach}=require('node:test');
const assert=require('node:assert/strict');
const memory=new Map();
let definition, calls, navigated, modalConfirm, failJoin;
const binding={tableId:'table-a08',tableName:'A08',sessionId:'b'.repeat(32)};
global.wx={
 getStorageSync:k=>memory.get(k),setStorageSync:(k,v)=>memory.set(k,structuredClone(v)),removeStorageSync:k=>memory.delete(k),
 cloud:{init(){},async callFunction({name,data}){
   if(name==='identity')return {result:{ok:true,role:'owner',storeId:'charcoal-demo'}};
   calls.push(data);
   return {result:failJoin?{ok:false,message:'桌台不存在'}:{ok:true,binding}};
 }},
 navigateTo({url}){navigated=url;},showToast(){},showModal(options){options.success({confirm:modalConfirm});},switchTab({url}){navigated=url;}
};
global.Page=p=>{definition=p;};
const store=require('../miniprogram/utils/store');
const tables=require('../miniprogram/utils/table-service');
require('../miniprogram/pages/table-manage/index');
const page=()=>({...definition,data:{...structuredClone(definition.data),authorized:true,tables:[{id:'table-a08',currentSessionId:null}]},setData(p){Object.assign(this.data,p);}});
const event={currentTarget:{dataset:{id:'table-a08'}}};
beforeEach(async()=>{
 memory.clear();store.reset();calls=[];navigated='';modalConfirm=true;failJoin=false;
 await tables.handleTableEntry({});
});
test('选桌先获取云端用餐身份，再切换到现有客户端菜单',async()=>{
 await page().assist(event);
 assert.deepEqual(calls,[{action:'merchantJoin',tableId:'table-a08'}]);
 assert.deepEqual(tables.tableState().binding,binding);
 assert.equal(navigated,'/pages/menu/index');
});
test('切桌取消保留购物车；确认后成功绑定才清空，绑定失败保留菜品',async()=>{
 store.changeCart('lemon','标准',1);
 modalConfirm=false;await page().assist(event);
 assert.equal(calls.length,0);assert.equal(store.cartView().count,1);assert.equal(navigated,'');
 modalConfirm=true;failJoin=true;await page().assist(event);
 assert.equal(store.cartView().count,1);assert.equal(navigated,'');
 failJoin=false;await page().assist(event);
 assert.equal(store.cartView().count,0);assert.equal(navigated,'/pages/menu/index');
});

test('点击桌号跳转本桌独立订单页并携带当前用餐会话',async()=>{
 const p=page();p.data.tables[0].currentSessionId=binding.sessionId;
 await p.openTable(event);
 assert.equal(navigated,'/pages/table-orders/index?tableId=table-a08&sessionId='+binding.sessionId);
 assert.equal(calls.length,0);
});
