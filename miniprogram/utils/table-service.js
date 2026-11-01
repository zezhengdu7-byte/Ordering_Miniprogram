"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tableCall = tableCall;
exports.tableState = tableState;
exports.handleTableEntry = handleTableEntry;
const auth_1 = require("./auth");
let binding = null;
let generation = 0;
let pending = false;
let error = '';
async function tableCall(action, data = {}) {
    var _a, _b;
    (0, auth_1.initAuth)();
    let timer;
    const r = await Promise.race([
        wx.cloud.callFunction({ name: 'table-service', data: { ...data, action } }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('桌台服务超时，请重试')), 15000); })
    ]).finally(() => clearTimeout(timer));
    if (!((_a = r.result) === null || _a === void 0 ? void 0 : _a.ok))
        throw new Error(((_b = r.result) === null || _b === void 0 ? void 0 : _b.message) || '桌台服务未部署或暂不可用');
    return r.result;
}
function tableState() { return { binding, pending, error }; }
async function handleTableEntry(options) {
    var _a;
    const scene = (_a = options === null || options === void 0 ? void 0 : options.query) === null || _a === void 0 ? void 0 : _a.scene;
    const seq = ++generation;
    pending = true;
    error = '';
    binding = null;
    // Any fresh scan clears previous authority immediately, including malformed scans.
    try {
        let result;
        if (scene !== undefined) {
            wx.removeStorageSync('table-binding');
            const token = decodeURIComponent(scene);
            if (!/^[A-Za-z0-9_-]{22}$/.test(token))
                throw new Error('桌码无效，请重新扫码');
            result = await tableCall('join', { token });
        }
        else {
            const saved = wx.getStorageSync('table-binding');
            if (!(saved === null || saved === void 0 ? void 0 : saved.sessionId))
                return;
            result = await tableCall('binding', { sessionId: saved.sessionId });
        }
        if (seq !== generation)
            return;
        binding = result.binding;
        wx.setStorageSync('table-binding', binding);
    }
    catch (e) {
        if (seq !== generation)
            return;
        error = e.message || '桌码识别失败，请重新扫码';
        wx.removeStorageSync('table-binding');
    }
    finally {
        if (seq === generation)
            pending = false;
    }
}
