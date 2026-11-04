const {test}=require('node:test');
const assert=require('node:assert/strict');
const memory=new Map();let response,cancel=false,calls=[],rejectJoin=false;
const binding={tableId:'t1',tableName:'A01',sessionId:'s1'};
global.wx={getStorageSync:k=>memory.get(k),setStorageSync:(k,v)=>memory.set(k,v),removeStorageSync:k=>memory.delete(k),
 scanCode(options){assert.equal(options.onlyFromCamera,true);cancel?options.fail({errMsg:'scanCode:fail cancel'}):options.success(response);},
 cloud:{init(){},async callFunction({data}){calls.push(data);return {result:rejectJoin?{ok:false,message:'桌码已停用'}:{ok:true,binding}};}}};
const tables=require('../miniprogram/utils/table-service');
test('内置扫码识别本小程序桌码，取消保留桌号，无效或停用码不能沿用原桌号',async()=>{
 const token='a'.repeat(22);response={path:'pages/menu/index?scene='+token};
 await tables.scanTable();assert.deepEqual(tables.tableState().binding,binding);
 assert.deepEqual(calls.at(-1),{action:'join',token});
 cancel=true;await assert.rejects(tables.scanTable());assert.deepEqual(tables.tableState().binding,binding);cancel=false;
 for(const path of ['', 'pages/other/index?scene='+token,'pages/menu/index?scene=%ZZ']){
   response={path};const n=calls.length;await assert.rejects(tables.scanTable());
   assert.equal(tables.tableState().binding,null);assert.equal(memory.has('table-binding'),false);assert.equal(calls.length,n);
 }
 response={path:'pages/menu/index?scene='+token};rejectJoin=true;
 await assert.rejects(tables.scanTable(),/桌码已停用/);assert.equal(tables.tableState().binding,null);
 rejectJoin=false;await tables.scanTable();assert.deepEqual(tables.tableState().binding,binding);
});

test('兼容编码路径、html后缀和微信小程序码原始内容，拒绝其他码和歧义参数',()=>{
 const token='a'.repeat(22);
 for(const path of ['pages/menu/index?scene='+token,'/pages/menu/index.html?scene='+token+'&scancode_time=1',encodeURIComponent('pages/menu/index?scene='+token),'pages/menu/index?scene%3D'+token]){
   assert.equal(tables.scanScene({path}),token);
 }
 global.wx.base64ToArrayBuffer=value=>Uint8Array.from(Buffer.from(value,'base64')).buffer;
 assert.equal(tables.scanScene({scanType:'WX_CODE',rawData:Buffer.from(token).toString('base64')}),token);
 assert.equal(tables.scanScene({scanType:'WX_CODE',result:token}),token);
 for(const result of [{scanType:'QR_CODE',result:token},{path:'pages/other/index?scene='+token},{path:'pages/menu/index?scene='+token+'&scene='+token},{path:'pages/menu/index?scene=%ZZ'},{scanType:'WX_CODE',rawData:'garbage'}])assert.equal(tables.scanScene(result),'');
});
