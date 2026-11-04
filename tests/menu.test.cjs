const {test,beforeEach}=require('node:test');
const assert=require('node:assert/strict');
const memory=new Map();
global.wx={getStorageSync:k=>memory.get(k),setStorageSync:(k,v)=>memory.set(k,structuredClone(v)),showToast(){},setNavigationBarTitle(){}};
const store=require('../miniprogram/utils/store');
let definition;
global.Page=p=>{definition=p};
require('../miniprogram/pages/menu/index');
const tables=require('../miniprogram/utils/table-service');
let page;
const step=(id,delta)=>page.quickStep({currentTarget:{dataset:{id,delta}}});
beforeEach(()=>{tables.tableState=()=>({binding:{sessionId:'confirmed',tableName:'A01'},pending:false});store.reset();page={...definition,data:structuredClone(definition.data),setData(p){Object.assign(this.data,p)}}});
test('从零加购先选辣度；取消不加购；确认后快捷加减沿用口味；归零再选',()=>{
  step('wings',1);assert.equal(page.data.selected.id,'wings');assert.equal(store.cartView().count,0);
  page.closeSelected();assert.equal(store.cartView().count,0);
  step('wings',1);page.flavor({currentTarget:{dataset:{value:'不辣'}}});page.addSelected();
  step('wings',1);assert.equal(page.data.selected,null);assert.equal(store.read().cart[0].flavor,'不辣');assert.equal(store.cartView().count,2);
  step('wings',-1);step('wings',-1);step('wings',1);
  assert.equal(page.data.selected.id,'wings');assert.equal(store.cartView().count,0);
});
test('还有其他口味时直接加购；饮料无需辣度选择；售罄不弹出选择',()=>{
  store.changeCart('beef-mini','微辣',1);store.changeCart('beef-mini','中辣',1);
  step('beef-mini',-1);step('beef-mini',1);assert.equal(page.data.selected,null);assert.equal(store.read().cart[0].quantity,2);
  step('lemon',1);assert.equal(page.data.selected,null);assert.equal(store.read().cart.find(i=>i.dishId==='lemon').flavor,'标准');
  store.setDishStatus('wings','soldOut');step('wings',1);assert.equal(page.data.selected,null);assert.equal(store.read().cart.some(i=>i.dishId==='wings'),false);
});

test('餐具纸巾显示在购物车并计入合计，收费后不重复加入',()=>{
  store.changeCart('wings','不辣',1);
  page.setData({dining:{people:2,cutlery:2,napkins:1,cutleryPrice:100,napkinPrice:200}});
  page.refresh();
  assert.equal(page.data.diningCart.length,2);assert.equal(page.data.count,4);
  assert.equal(page.data.totalText,'12.00');
  page.data.dining.cutlery=0;page.refresh();
  assert.equal(page.data.diningCart.some(i=>i.id==='cutlery'),false);assert.equal(page.data.totalText,'10.00');
  page.setData({diningCharged:true});page.refresh();
  assert.equal(page.data.diningCart.length,0);assert.equal(page.data.totalText,'8.00');
});

test('菜单5串起点可从5串直接减除，再加仍从5串开始',()=>{
  store.changeCart('lamb','微辣',1);step('lamb',1);
  assert.equal(store.cartView().count,6);
  step('lamb',-1);assert.equal(store.cartView().count,5);
  step('lamb',-1);assert.equal(store.cartView().count,0);
  step('lamb',1);assert.equal(page.data.selected.id,'lamb');
  page.addSelected();assert.equal(store.cartView().count,5);
});

test('购物车餐具纸巾可加减、减到零移除并重新添加',async()=>{
  const repository=require('../miniprogram/utils/cloud-repository');
  const tables=require('../miniprogram/utils/table-service');
  const oldCall=repository.call,oldState=tables.tableState;
  let saved={people:1,cutlery:1,napkins:1,cutleryPrice:100,napkinPrice:100};
  tables.tableState=()=>({binding:{sessionId:'dining-test',tableName:'A01'}});
  repository.call=async(action,payload)=>{
    assert.equal(action,'setDining');
    saved={...saved,cutlery:payload.cutlery,napkins:payload.napkins};
    return {dining:saved,charged:false};
  };
  try {
    page.diningSession='dining-test';page.setData({dining:saved});
    const change=(id,delta)=>page.stepDining({currentTarget:{dataset:{id,delta}}});
    await change('cutlery',1);assert.equal(page.data.dining.cutlery,2);
    await change('cutlery',-1);await change('cutlery',-1);
    assert.equal(page.data.diningCart.some(i=>i.id==='cutlery'),false);
    await change('napkins',-1);assert.equal(page.data.diningCart.length,0);
    assert.equal(page.data.totalText,'0.00');
    await change('cutlery',1);await change('napkins',1);
    assert.equal(page.data.diningCart.length,2);assert.equal(page.data.totalText,'2.00');
  } finally {repository.call=oldCall;tables.tableState=oldState;}
});

test('菜单轮询数据未变时不重复setData，购物车变化时仍及时更新',()=>{
  let updates=[];
  page.setData=function(p){updates.push(p);Object.assign(this.data,p);};
  page.refresh();updates=[];
  page.refresh();page.refresh();
  assert.equal(updates.length,0);
  store.changeCart('lamb','微辣',1);page.refresh();
  assert.equal(updates.length,1);assert.equal(page.data.count,5);
  updates=[];page.refresh();assert.equal(updates.length,0);
});
test('菜单隐藏后轮询不再刷新或创建定时器',()=>{
  let refreshed=0;page.refresh=()=>{refreshed++;};
  page.menuVisible=false;page.pollTable();
  assert.equal(refreshed,0);assert.equal(page.tableTimer,undefined);
});

test('未确认桌号或正在校验时，所有商品加购入口与下单入口均被阻止',async()=>{
  for(const state of [{binding:null,pending:false},{binding:{sessionId:'old'},pending:true}]){
    tables.tableState=()=>state;
    page.setData({selected:{id:'lemon'}});
    step('lemon',1);page.choose({currentTarget:{dataset:{id:'wings'}}});
    page.addSelected();page.step({currentTarget:{dataset:{id:'lemon',flavor:'标准',delta:1}}});
    page.checkout();await page.submit();
    assert.equal(store.cartView().count,0);
    assert.equal(page.data.cartOpen,false);assert.equal(page.data.diningOpen,false);
    assert.equal(page.data.selected.id,'lemon');
  }
});
test('未绑定时显示未选择桌号，底部按钮启动扫码',()=>{
  tables.tableState=()=>({binding:null,pending:false});page.refresh();
  assert.equal(page.data.tableName,'未选择桌号');assert.equal(page.data.tableConfirmed,false);
  let scans=0;page.scanTable=()=>{scans++;};page.checkoutOrScan();
  assert.equal(scans,1);assert.equal(page.data.cartOpen,false);
});

test('辣度弹窗打开后售罄，旧弹窗和购物车加号均不能再加入',()=>{
 step('wings',1);assert.equal(page.data.selected.id,'wings');
 store.setDishStatus('wings','soldOut');
 page.addSelected();assert.equal(store.cartView().count,0);
 page.step({currentTarget:{dataset:{id:'wings',flavor:'微辣',delta:1}}});
 assert.equal(store.cartView().count,0);
 page.refresh();assert.equal(page.data.selected,null);
 page.addSelected();assert.equal(store.cartView().count,0);
});

test('所有可选辣度商品每次打开默认不辣，不沿用上次弹窗选择',()=>{
 for(const dish of store.read().dishes.filter(d=>d.spicy&&d.onSale&&!d.soldOut)){
  page.choose({currentTarget:{dataset:{id:dish.id}}});
  assert.equal(page.data.flavor,'不辣',dish.name);
  page.flavor({currentTarget:{dataset:{value:'特辣'}}});page.closeSelected();
  page.choose({currentTarget:{dataset:{id:dish.id}}});assert.equal(page.data.flavor,'不辣');
  page.closeSelected();
 }
 step('wings',1);page.addSelected();assert.equal(store.read().cart[0].flavor,'不辣');
});
