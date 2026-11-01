'use strict';
// 只接受微信可信调用上下文；event.openid/event.role/event.appid 全部不参与鉴权。
async function resolveIdentity(db, context, storeId) {
  const { OPENID, APPID } = context;
  if (!OPENID || !APPID) throw new Error('UNAUTHENTICATED');
  if (typeof storeId !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(storeId)) throw new Error('INVALID_STORE');
  const stores = await db.collection('stores').where({ storeId, appId: APPID, active: true }).limit(1).get();
  if (!stores.data.length) throw new Error('STORE_UNAVAILABLE');
  const members = await db.collection('store_members').where({ storeId, appId: APPID, openid: OPENID, active: true }).limit(2).get();
  const roles = members.data.map(x => x.role);
  return { storeId, role: roles.includes('owner') ? 'owner' : roles.includes('staff') ? 'staff' : 'customer' };
}
async function requireMerchant(db, context, storeId) {
  const identity = await resolveIdentity(db, context, storeId);
  if (!['owner', 'staff'].includes(identity.role)) throw new Error('FORBIDDEN');
  return identity;
}
module.exports = { resolveIdentity, requireMerchant };
