const {test}=require('node:test');
const assert=require('node:assert/strict');
const memory=new Map();global.wx={getStorageSync:k=>memory.get(k),setStorageSync:(k,v)=>memory.set(k,structuredClone(v))};
const repo=require('../miniprogram/utils/cloud-repository');
require('../miniprogram/utils/store').reset();
let orders=[];repo.orderView=()=>orders;
let definition;global.Page=p=>definition=p;require('../miniprogram/pages/manage/index');
test('跨日订单在结清当天计入收款与接待桌数，同桌加单只计一桌',()=>{
 const now=Date.now(),date=new Date(now),start=new Date(date.getFullYear(),date.getMonth(),date.getDate()).getTime();
 orders=[{createdAt:start-3600000,settledAt:now,paid:true,status:'completed',sessionId:'a',total:1250},
 {createdAt:start-3600000,settledAt:now,paid:true,status:'completed',sessionId:'a',total:100},
 {createdAt:start-3600000,settledAt:now,paid:true,status:'completed',sessionId:'b',total:1950},
 {createdAt:start-7200000,settledAt:start-3600000,paid:true,status:'completed',sessionId:'old',total:9999},
 {createdAt:now,settledAt:now,paid:true,status:'cancelled',sessionId:'cancelled',total:9999}];
 const p={...definition,data:{authorized:true},setData(v){Object.assign(this.data,v);}};p.refresh();
 assert.equal(p.data.todayTableCount,2);assert.equal(p.data.paidText,'33.00');
});
