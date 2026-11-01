'use strict';
const cloud = require('wx-server-sdk');
const { resolveIdentity } = require('./access');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
exports.main = async (event) => {
  try {
    const identity = await resolveIdentity(cloud.database(), cloud.getWXContext(), event && event.storeId);
    return { ok: true, ...identity, accountId: cloud.getWXContext().OPENID };
  } catch (_) { return { ok: false, code: 'IDENTITY_UNAVAILABLE' }; }
};
