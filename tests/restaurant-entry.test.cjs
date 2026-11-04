const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
test('部署入口为修改订单服务传入购物车校验器',async()=>{
 const exports={};
 vm.runInNewContext(fs.readFileSync(require.resolve('../cloudfunctions/restaurant/index.js'),'utf8'),{
 exports,console,require(name){
  if(name==='wx-server-sdk')return {init(){},getWXContext:()=>({APPID:'wx7dc3e02ff34b0133',OPENID:'guest'}),database:()=>({})};
  if(name==='./access')return {resolveIdentity:async()=>({role:'customer'})};
  if(name==='./invariants.cjs')return require('../cloudfunctions/restaurant/invariants.cjs');
  if(name==='./service')return {createService(db,ctx,identity,validators){return {dispatch:async event=>{validators.validateCart(event.payload.lines);return 'validated';}};}};
  throw new Error(name);
 }
 });
 const ok=await exports.main({action:'editCustomerOrder',payload:{lines:[{dishId:'beef',flavor:'微辣',quantity:5}]}});
 assert.equal(ok.ok,true);assert.equal(ok.data,'validated');
 const bad=await exports.main({action:'editCustomerOrder',payload:{lines:[{dishId:'beef',flavor:'微辣',quantity:-1}]}});
 assert.equal(bad.ok,false);assert.equal(bad.code,'INVALID_QUANTITY');
});
