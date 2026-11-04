const {test,beforeEach}=require('node:test');
const assert=require('node:assert/strict');
const memory=new Map();
let definition,closed,table,modalResult,toasts,modal,confirm;
global.wx={
 getStorageSync:k=>memory.get(k),setStorageSync:(k,v)=>memory.set(k,structuredClone(v)),
 cloud:{init(){},async callFunction(){return {result:{ok:true,role:'owner',storeId:'charcoal-demo'}};}},
 showToast(p){toasts.push(p.title);},redirectTo(){},setNavigationBarTitle(){},
 showModal(p){assert(p.confirmText.length<=4,'微信弹窗确认按钮最多4个字符');assert(p.cancelText.length<=4);modal=p;modalResult=p.success({confirm});}
};
const repo=require('../miniprogram/utils/cloud-repository');
const tables=require('../miniprogram/utils/table-service');
const store=require('../miniprogram/utils/store');
let orders=[];
repo.syncOrders=async()=>{};
repo.orderView=()=>orders;
tables.tableCall=async(action,payload)=>{
 if(action==='close'){closed.push(payload);table.currentSessionId=null;return {ok:true};}
 return {tables:[table]};
};
global.Page=p=>{definition=p;};
require('../miniprogram/pages/table-orders/index');
const row=(id,sessionId,status,paid=false,tableId='table-a01')=>({id,sessionId,tableId,status,paid,total:1000,table:'A01',items:[],note:''});
function page(){return {...definition,data:{...structuredClone(definition.data),authorized:true,tableId:'table-a01',tableSessionId:'current'},orderPageVisible:true,setData(p){Object.assign(this.data,p);}};}
beforeEach(()=>{store.reset();closed=[];toasts=[];table={id:'table-a01',name:'A01',currentSessionId:'current'};orders=[];modalResult=null;modal=null;confirm=true;});
test('桌台详情只汇总当前桌当前用餐，包含各订单状态且筛选不影响结账判断',async()=>{
 orders=[row('1','current','pending'),row('2','current','accepted'),row('3','current','completed',true),row('4','current','cancelled'),
 row('old','previous','completed'),row('other','current','pending',false,'table-a02')];
 const p=page();
 try{
  await p.pollOrders();
  assert.equal(p.data.filter,'pending');assert.equal(p.data.orders.length,1);await p.filter({currentTarget:{dataset:{id:'all'}}});assert.equal(p.data.orders.length,4);assert.equal(p.data.pendingCount,1);assert.equal(p.data.makingCount,1);
  assert.equal(p.data.completedCount,1);assert.equal(p.data.tableTotalText,'30.00');
  assert.equal(p.data.unfinishedCount,2);
  p.data.filter='completed';p.refresh();assert.equal(p.data.orders.length,1);assert.equal(p.data.unfinishedCount,2);
  await p.endDining();assert.equal(closed.length,0);assert(toasts.includes('还有订单未完成，请先处理'));
 }finally{p.onHide();}
});
test('结束用餐提示本桌消费和未结金额，商家确认结清后关桌',async()=>{
 orders=[row('1','current','completed',false)];
 const p=page();
 try{
  await p.pollOrders();confirm=false;await p.endDining();await modalResult;
  assert.match(modal.content,/消费合计 ¥10.00，未结金额 ¥10.00/);assert.equal(closed.length,0);
  confirm=true;await p.endDining();await modalResult;
  assert.deepEqual(closed,[{tableId:'table-a01',sessionId:'current',confirmSettlement:true,expectedTotal:1000}]);
  assert.equal(p.data.sessionEnded,true);assert.equal(p.data.orders.length,0);await p.filter({currentTarget:{dataset:{id:'all'}}});assert.equal(p.data.orders.length,1);assert.equal(table.currentSessionId,null);
 }finally{p.onHide();}
});
test('桌台换了一批客人后原详情页不混入新订单也不能结束新会话',async()=>{
 orders=[row('old','current','completed',true),row('new','next','pending')];table.currentSessionId='next';
 const p=page();
 try{await p.pollOrders();assert.equal(p.data.sessionEnded,true);assert.equal(p.data.orders.length,0);await p.filter({currentTarget:{dataset:{id:'all'}}});assert.equal(p.data.orders.length,1);await p.endDining();assert.equal(closed.length,0);}
 finally{p.onHide();}
});
