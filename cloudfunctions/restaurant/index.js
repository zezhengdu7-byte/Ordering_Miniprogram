'use strict';
const cloud = require('wx-server-sdk');
const { resolveIdentity } = require('./access');
const { priceOrder, assertVersion } = require('./invariants.cjs');
const { createService } = require('./service');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
exports.main = async event => {
  try {
    const ctx = cloud.getWXContext();
    if (ctx.APPID !== 'wx7dc3e02ff34b0133') throw new Error('UNAUTHENTICATED');
    const db = cloud.database();
    const identity = await resolveIdentity(db, ctx, 'charcoal-demo');
    if (event?.action === 'uploadImage') {
      if (!['owner','staff'].includes(identity.role)) throw new Error('FORBIDDEN');
      const content = event.payload?.content;
      if (typeof content !== 'string' || !content.length || content.length > 2800000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(content)) throw new Error('INVALID_IMAGE');
      const buffer = Buffer.from(content,'base64');
      const jpg = buffer[0]===255 && buffer[1]===216;
      const png = buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
      const webp = buffer.toString('ascii',0,4)==='RIFF' && buffer.toString('ascii',8,12)==='WEBP';
      if (!jpg && !png && !webp) throw new Error('INVALID_IMAGE');
      const name = require('crypto').randomBytes(16).toString('hex');
      const uploaded = await cloud.uploadFile({cloudPath:`merchant-menu/${name}.${jpg?'jpg':png?'png':'webp'}`,fileContent:buffer});
      return {ok:true,data:uploaded.fileID};
    }
    return { ok: true, data: await createService(db, ctx, identity, { priceOrder, assertVersion }).dispatch(event || {}) };
  } catch (error) {
    const code = /^[A-Z_]+$/.test(error.message) ? error.message : 'SERVICE_UNAVAILABLE';
    if (code === 'SERVICE_UNAVAILABLE') console.error('restaurant', error.code || error.errCode || 'UNKNOWN', error.message);
    return { ok: false, code };
  }
};
