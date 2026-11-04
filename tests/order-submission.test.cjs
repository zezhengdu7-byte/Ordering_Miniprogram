const {test}=require('node:test');
const assert=require('node:assert/strict');
const memory=new Map();let submitted;
global.wx={getStorageSync:k=>memory.get(k),setStorageSync:(k,v)=>memory.set(k,v),cloud:{init(){},async callFunction({data}){submitted=data;return {result:{ok:true,data:{id:'order-test',items:[]}}};}}};
const repo=require('../miniprogram/utils/cloud-repository');
const store=require('../miniprogram/utils/store');
const tables=require('../miniprogram/utils/table-service');
test('菜单传入已确认会话时，提交沿用该会话，即使订单模块中桌号状态尚未更新',async()=>{
 store.reset();store.changeCart('lemon','标准',1);
 tables.tableState=()=>({binding:null,pending:false});
 const binding={tableId:'a01',tableName:'A01',sessionId:'a'.repeat(32)};
 const order=await repo.submitOrder('',binding);
 assert.equal(order.id,'order-test');assert.equal(submitted.payload.tableId,binding.tableId);
 assert.equal(submitted.payload.sessionId,binding.sessionId);assert.equal(store.cartView().count,0);
 await assert.rejects(repo.submitOrder(''),/请先扫描桌码/);
});
