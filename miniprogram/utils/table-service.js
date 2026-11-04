"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tableCall = tableCall;
exports.tableState = tableState;
exports.enterMerchantTable = enterMerchantTable;
exports.handleTableEntry = handleTableEntry;
exports.scanScene = scanScene;
exports.scanTable = scanTable;
exports.clearTableBinding = clearTableBinding;
exports.refreshTableBinding = refreshTableBinding;
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
async function enterMerchantTable(tableId) {
    const seq = ++generation;
    pending = true;
    error = '';
    try {
        const result = await tableCall('merchantJoin', { tableId });
        if (seq !== generation)
            throw new Error('桌号已变化，请重新选择');
        binding = result.binding;
        wx.setStorageSync('table-binding', binding);
    }
    finally {
        if (seq === generation)
            pending = false;
    }
}
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
// 路径和 scene 在不同客户端可能经过编码；桌号权限始终由云端令牌校验。
function scanScene(result) {
    let path = typeof result.path === 'string' ? result.path : '';
    for (let i = 0; i < 2; i++) {
        const match = /^\/?pages\/menu\/index(?:\.html)?\?([^#]*)(?:#.*)?$/.exec(path);
        if (match) {
            const values = match[1].split('&').filter(part => /^scene(?:=|%3d)/i.test(part));
            if (values.length !== 1)
                return '';
            let value = values[0].replace(/^scene(?:=|%3d)/i, '');
            for (let n = 0; n < 2; n++) {
                if (/^[A-Za-z0-9_-]{22}$/.test(value))
                    return value;
                try {
                    value = decodeURIComponent(value);
                }
                catch (_) {
                    return '';
                }
            }
            return '';
        }
        try {
            const decoded = decodeURIComponent(path);
            if (decoded === path)
                break;
            path = decoded;
        }
        catch (_) {
            return '';
        }
    }
    // 部分扫码回调只提供 WX_CODE 的原始内容，不包含本小程序路径。
    if (!result.path && result.scanType === 'WX_CODE') {
        if (typeof result.result === 'string' && /^[A-Za-z0-9_-]{22}$/.test(result.result))
            return result.result;
        if (typeof result.rawData === 'string') {
            try {
                const bytes = new Uint8Array(wx.base64ToArrayBuffer(result.rawData));
                const token = Array.from(bytes).map(v => String.fromCharCode(v)).join('');
                if (/^[A-Za-z0-9_-]{22}$/.test(token))
                    return token;
            }
            catch (_) { }
        }
    }
    return '';
}
async function scanTable() {
    const result = await new Promise((resolve, reject) => wx.scanCode({
        onlyFromCamera: true, success: resolve, fail: reject
    }));
    const scene = scanScene(result);
    await handleTableEntry({ query: { scene } });
    if (!scene)
        throw new Error('未读到桌号信息，请扫描本店桌码；开发工具请用真机预览测试');
    const state = tableState();
    if (!state.binding || state.error)
        throw new Error(state.error || '桌码识别失败，请重新扫码');
}
function clearTableBinding(sessionId) {
    if ((binding === null || binding === void 0 ? void 0 : binding.sessionId) !== sessionId)
        return;
    ++generation;
    binding = null;
    pending = false;
    error = '本次用餐已结束，请重新扫码';
    wx.removeStorageSync('table-binding');
}
async function refreshTableBinding() {
    const current = binding;
    if (!current || pending)
        return;
    try {
        await tableCall('binding', { sessionId: current.sessionId });
    }
    catch (e) {
        if (/本次用餐已结束|请重新扫描桌码/.test(e.message))
            clearTableBinding(current.sessionId);
    }
}
