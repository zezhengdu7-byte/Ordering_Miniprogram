'use strict';
const crypto = require('crypto');
const { resolveIdentity, requireMerchant } = require('./access');
const STORE = 'charcoal-demo', APP = 'wx7dc3e02ff34b0133';
const hash = s => crypto.createHash('sha256').update(s).digest('hex');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const publicTable = t => ({ id: t._id, name: t.name, active: t.active, qrEnabled: t.qrEnabled !== false, currentSessionId: t.currentSessionId || null, codeFileID: t.codes?.release || '' });
async function optional(ref) { try { return (await ref.get()).data || null; } catch (e) { if (/not exist|not found|不存在|DATABASE_DOCUMENT_NOT_EXIST/i.test(e.message || '')) return null; throw e; } }
function createService(cloud) {
  const db = cloud.database();
  return async (event, context) => {
    try {
      assert(context.APPID === APP && context.OPENID, '微信身份或小程序不匹配');
      const action = event.action;
      if (action === 'join') {
        await resolveIdentity(db, context, STORE);
        assert(typeof event.token === 'string' && /^[A-Za-z0-9_-]{22}$/.test(event.token), '桌码无效，请重新扫码');
        const tokenHash = hash(event.token);
        const found = await db.collection('tables').where({ qrTokenHash: tokenHash, active: true }).limit(1).get();
        assert(found.data.length, '桌码已失效，请联系店员');
        assert(found.data[0].qrEnabled !== false, '桌码已停用，请联系店员');
        const tableId = found.data[0]._id;
        const sessionId = crypto.randomBytes(16).toString('hex');
        const binding = await db.runTransaction(async tx => {
          const ref = tx.collection('tables').doc(tableId), t = (await ref.get()).data;
          assert(t.active && t.qrTokenHash === tokenHash && t.qrEnabled !== false, '桌码已停用，请联系店员');
          let session = t.currentSessionId ? await optional(tx.collection('sessions').doc(t.currentSessionId)) : null;
          if (!session || session.status !== 'open') {
            session = { _id: sessionId, tableId, tableName: t.name, status: 'open', unsettledOrderIds: [], closedAt: null, createdAt: Date.now(), updatedAt: Date.now() };
            const { _id, ...data } = session;
            await tx.collection('sessions').doc(_id).set({ data });
            await tx.collection('carts').doc(_id).set({ data: { sessionId: _id, version: 0, lines: [], createdAt: Date.now(), updatedAt: Date.now() } });
          }
          // Every join writes the table and session: concurrent first scans/closing conflict and retry.
          await ref.update({ data: { currentSessionId: session._id, updatedAt: Date.now() } });
          await tx.collection('sessions').doc(session._id).update({ data: { updatedAt: Date.now() } });
          await tx.collection('session_members').doc(hash(session._id + ':' + context.OPENID)).set({ data: { sessionId: session._id, openid: context.OPENID, active: true, lastSeenAt: Date.now(), createdAt: Date.now(), updatedAt: Date.now() } });
          return { tableId, tableName: t.name, sessionId: session._id };
        });
        return { ok: true, binding };
      }
      if (action === 'binding') {
        await resolveIdentity(db, context, STORE);
        assert(typeof event.sessionId === 'string' && /^[a-f0-9]{32}$/.test(event.sessionId), '请重新扫描桌码');
        const binding = await db.runTransaction(async tx => {
          const s = await optional(tx.collection('sessions').doc(event.sessionId));
          const m = await optional(tx.collection('session_members').doc(hash(event.sessionId + ':' + context.OPENID)));
          assert(s && s.status === 'open' && m && m.active, '本次用餐已结束，请重新扫码');
          const t = (await tx.collection('tables').doc(s.tableId).get()).data;
          assert(t.active && t.currentSessionId === s._id, '本次用餐已结束，请重新扫码');
          return { tableId: s.tableId, tableName: s.tableName, sessionId: s._id };
        });
        return { ok: true, binding };
      }
      await requireMerchant(db, context, STORE);
      if (action === 'list') {
        let tables = [], skip = 0;
        while (true) { const r = await db.collection('tables').where({ active: true }).orderBy('name', 'asc').skip(skip).limit(100).get(); tables.push(...r.data.map(publicTable)); if (r.data.length < 100) break; skip += 100; }
        return { ok: true, tables };
      }
      if (action === 'add') {
        const name = typeof event.name === 'string' ? event.name.trim().normalize('NFKC').toUpperCase() : '';
        assert(name && name.length <= 12, '桌号需为1至12个字符');
        const sameName = await db.collection('tables').where({ name, active: true }).limit(1).get();
        assert(!sameName.data.length, '桌号已存在');
        const id = hash(name);
        await db.runTransaction(async tx => {
          const ref = tx.collection('tables').doc(id), existing = await optional(ref);
          assert(!existing || !existing.active, '桌号已存在');
          await ref.set({ data: { name, active: true, qrEnabled: true, qrTokenHash: '', qrVersion: (existing?.qrVersion || 0) + 1, currentSessionId: null, createdAt: Date.now(), updatedAt: Date.now() } });
        });
        return { ok: true };
      }
      assert(typeof event.tableId === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(event.tableId), '桌台无效');
      const ref = db.collection('tables').doc(event.tableId), table = await optional(ref);
      assert(table && table.active, '桌台不存在');
      if (action === 'code') {
        const version = 'release';
        const cached = table.codes && table.codes[version];
        if (cached) return { ok: true, fileID: cached };
        const token = crypto.randomBytes(16).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        const image = await cloud.openapi.wxacode.getUnlimited({ page: 'pages/menu/index', scene: token, envVersion: version, checkPath: false, width: 860 });
        assert(image.buffer && !image.errCode, '微信未能生成桌码');
        const upload = await cloud.uploadFile({ cloudPath: `table-codes/${event.tableId}/${crypto.randomBytes(16).toString('hex')}-${version}.png`, fileContent: image.buffer });
        try {
          await db.runTransaction(async tx => {
            const current = (await tx.collection('tables').doc(event.tableId).get()).data;
            assert(current.active && current.qrVersion === table.qrVersion && current.qrTokenHash === table.qrTokenHash, '桌码已被其他操作更新，请重试');
            // A table receives one permanent release code. Viewing and saving never rotate it.
            await tx.collection('tables').doc(event.tableId).update({ data: { qrTokenHash: hash(token), qrVersion: current.qrVersion + 1, codes: { [version]: upload.fileID }, updatedAt: Date.now() } });
          });
        } catch (e) { await cloud.deleteFile({ fileList: [upload.fileID] }).catch(() => {}); throw e; }
        return { ok: true, fileID: upload.fileID };
      }
      if (action === 'setQrEnabled') {
        assert(typeof event.enabled === 'boolean', '参数无效');
        await db.runTransaction(async tx => {
          const r = tx.collection('tables').doc(event.tableId), t = (await r.get()).data;
          assert(t.active, '桌台不存在');
          await r.update({ data: { qrEnabled: event.enabled, updatedAt: Date.now() } });
        });
        return { ok: true, qrEnabled: event.enabled };
      }
      if (action === 'remove' || action === 'close') {
        await db.runTransaction(async tx => {
          const r = tx.collection('tables').doc(event.tableId), t = (await r.get()).data;
          assert(t.active, '桌台不存在');
          if (action === 'remove') { assert(!t.currentSessionId, '请先结束本次用餐'); await r.update({ data: { active: false, updatedAt: Date.now() } }); return; }
          assert(t.currentSessionId, '当前没有进行中的用餐');
          const sid = t.currentSessionId;
          const session = (await tx.collection('sessions').doc(sid).get()).data;
          assert(session.status === 'open' && !(session.unsettledOrderIds || []).length, '该桌还有未完成或未结算的订单');
          const cart = (await tx.collection('carts').doc(sid).get()).data;
          assert(!cart.lines.length, '购物车非空，不能关桌');
          assert(sid === table.currentSessionId, '用餐会话已变化，请刷新重试');
          await tx.collection('sessions').doc(sid).update({ data: { status: 'closed', closedAt: Date.now(), updatedAt: Date.now() } });
          await r.update({ data: { currentSessionId: null, updatedAt: Date.now() } });
        });
        return { ok: true };
      }
      throw new Error('不支持的操作');
    } catch (e) { console.error('table-service', e); return { ok: false, message: ['FORBIDDEN','UNAUTHENTICATED','STORE_UNAVAILABLE'].includes(e.message) ? '当前微信没有操作权限或门店不可用' : e.message || '桌台服务暂不可用' }; }
  };
}
module.exports = { createService, hash };
