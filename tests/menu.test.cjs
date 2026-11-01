const {test,beforeEach}=require('node:test');
const assert=require('node:assert/strict');
const memory=new Map();
global.wx={getStorageSync:k=>memory.get(k),setStorageSync:(k,v)=>memory.set(k,structuredClone(v)),showToast(){}};
const store=require('../miniprogram/utils/store');
let definition;
global.Page=p=>{definition=p};
require('../miniprogram/pages/menu/index');
let page;
const step=(id,delta)=>page.quickStep({currentTarget:{dataset:{id,delta}}});
beforeEach(()=>{store.reset();page={...definition,data:structuredClone(definition.data),setData(p){Object.assign(this.data,p)}}});
test('从零加购先选辣度；取消不加购；确认后快捷加减沿用口味；归零再选',()=>{
  step('lamb',1);assert.equal(page.data.selected.id,'lamb');assert.equal(store.cartView().count,0);
  page.closeSelected();assert.equal(store.cartView().count,0);
  step('lamb',1);page.flavor({currentTarget:{dataset:{value:'不辣'}}});page.addSelected();
  step('lamb',1);assert.equal(page.data.selected,null);assert.equal(store.read().cart[0].flavor,'不辣');assert.equal(store.cartView().count,2);
  step('lamb',-1);step('lamb',-1);step('lamb',1);
  assert.equal(page.data.selected.id,'lamb');assert.equal(store.cartView().count,0);
});
test('还有其他口味时直接加购；饮料无需辣度选择；售罄不弹出选择',()=>{
  store.changeCart('lamb','微辣',1);store.changeCart('lamb','中辣',1);
  step('lamb',-1);step('lamb',1);assert.equal(page.data.selected,null);assert.equal(store.read().cart[0].quantity,2);
  step('lemon',1);assert.equal(page.data.selected,null);assert.equal(store.read().cart.find(i=>i.dishId==='lemon').flavor,'标准');
  store.setDishStatus('wings','soldOut');step('wings',1);assert.equal(page.data.selected,null);assert.equal(store.read().cart.some(i=>i.dishId==='wings'),false);
});
