const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolveIdentity, requireMerchant } = require('../cloudfunctions/identity/access');
const context = { OPENID: 'wechat-a', APPID: 'wx-app-a' };
function database(stores = [], members = []) {
  return { collection(name) { return { where(query) { return { limit(n) { return { async get() { return { data: (name === 'stores' ? stores : members).filter(row => Object.entries(query).every(([k,v]) => row[k] === v)).slice(0,n) }; } }; } }; } }; } };
}
const store = { storeId: 'store-a', appId: 'wx-app-a', active: true };
const member = { ...store, openid: 'wechat-a', role: 'staff' };
test('微信上下文缺失拒绝认证，不接受客户端伪造身份', async () => {
  await assert.rejects(resolveIdentity(database([store],[member]), { openid: 'wechat-a', appid: 'wx-app-a', role: 'owner' }, 'store-a'), /UNAUTHENTICATED/);
});
test('普通顾客没有管理权限；只返回当前身份，不泄露 openid', async () => {
  const db = database([store],[]);
  assert.deepEqual(await resolveIdentity(db,context,'store-a'), {storeId:'store-a',role:'customer'});
  await assert.rejects(requireMerchant(db,context,'store-a'), /FORBIDDEN/);
});
test('员工需要同时匹配门店、AppID、微信身份和启用状态', async () => {
  assert.equal((await requireMerchant(database([store],[member]),context,'store-a')).role,'staff');
  for (const patch of [{storeId:'store-b'},{appId:'wx-other'},{openid:'wechat-b'},{active:false},{role:'admin'}]) {
    await assert.rejects(requireMerchant(database([store],[{...member,...patch}]),context,'store-a'), /FORBIDDEN/);
  }
});
test('失效门店与跨小程序访问拒绝；店主角色正确返回', async () => {
  for (const patch of [{active:false},{appId:'wx-other'}]) await assert.rejects(resolveIdentity(database([{...store,...patch}],[member]),context,'store-a'), /STORE_UNAVAILABLE/);
  assert.equal((await requireMerchant(database([store],[{...member,role:'owner'}]),context,'store-a')).role,'owner');
});
test('客户端无配置、无权限和网络失败均阻止页面操作；撤权后立即拒绝', async () => {
  const { cloudConfig } = require('../miniprogram/config');
  let response = { ok:true,storeId:cloudConfig.storeId,role:'staff' };
  let fail = false, called = 0, redirects = [];
  global.wx = { showToast(){}, redirectTo(o){redirects.push(o.url)}, cloud: { init(){}, async callFunction(){ if(fail) throw Error('network'); return {result:response}; } } };
  const auth = require('../miniprogram/utils/auth');
  const methods = auth.merchantPage({data:{}, action(){called++}});
  const page = {...methods,data:{...methods.data},setData(value){Object.assign(this.data,value)}};
  cloudConfig.envId='';
  await page.action(); assert.equal(called,0); assert.equal(page.data.authorized,false);
  cloudConfig.envId='test-env';
  await page.action(); assert.equal(called,1); assert.equal(page.data.authorized,true);
  response={...response,role:'customer'};
  await page.action(); assert.equal(called,1); assert.equal(page.data.authorized,false);
  response={...response,role:'staff',storeId:'other-store'};
  await page.action(); assert.equal(called,1);
  fail=true; await page.action(); assert.equal(called,1); assert.equal(auth.isMerchant(),false);
  assert.equal(redirects.length,4);
  cloudConfig.envId='';
});
test('本地预览只允许无云环境的开发工具开发版，不授予商家身份', async () => {
  const { cloudConfig } = require('../miniprogram/config');
  const auth = require('../miniprogram/utils/auth');
  let platform = 'devtools', envVersion = 'develop';
  global.wx = {getDeviceInfo:()=>({platform}),getAccountInfoSync:()=>({miniProgram:{envVersion}})};
  cloudConfig.envId=''; auth.clearIdentity(); auth.leaveMerchantPreview();
  await assert.rejects(auth.requireMerchant());
  auth.enterMerchantPreview(); await auth.requireMerchant();
  assert.equal(auth.isMerchant(),false);
  platform='ios'; assert.equal(auth.isMerchantPreview(),false); assert.throws(auth.enterMerchantPreview);
  platform='devtools'; envVersion='release'; assert.equal(auth.canPreviewMerchant(),false);
  envVersion='trial'; assert.equal(auth.canPreviewMerchant(),false);
  envVersion='develop'; cloudConfig.envId='configured'; assert.equal(auth.canPreviewMerchant(),false);
  cloudConfig.envId=''; auth.leaveMerchantPreview(); assert.equal(auth.isMerchantPreview(),false);
});

test('云端身份请求不返回时超时拒绝，不执行商家操作', async () => {
  const { cloudConfig } = require('../miniprogram/config');
  const auth = require('../miniprogram/utils/auth');
  const originalEnv = cloudConfig.envId;
  const originalSetTimeout = global.setTimeout, originalClearTimeout = global.clearTimeout;
  let expire, cleared = false, actions = 0, redirected = false;
  try {
    cloudConfig.envId = 'test-env';
    global.setTimeout = callback => { expire = callback; return 123; };
    global.clearTimeout = id => { cleared = id === 123; };
    global.wx = { cloud: { init(){}, callFunction: () => new Promise(() => {}) }, showToast(){}, redirectTo(){redirected = true;} };
    const methods = auth.merchantPage({data:{}, action(){actions++;}});
    const page = {...methods, data:{...methods.data}, setData(values){Object.assign(this.data, values);}};
    const pending = page.action();
    expire();
    await pending;
    assert.equal(actions, 0);
    assert.equal(page.data.authorized, false);
    assert.equal(redirected, true);
    assert.equal(cleared, true);
  } finally {
    cloudConfig.envId = originalEnv;
    global.setTimeout = originalSetTimeout; global.clearTimeout = originalClearTimeout;
  }
});
