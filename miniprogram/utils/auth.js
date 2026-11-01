"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canPreviewMerchant = canPreviewMerchant;
exports.isMerchantPreview = isMerchantPreview;
exports.enterMerchantPreview = enterMerchantPreview;
exports.leaveMerchantPreview = leaveMerchantPreview;
exports.configured = configured;
exports.initAuth = initAuth;
exports.isMerchant = isMerchant;
exports.clearIdentity = clearIdentity;
exports.refreshIdentity = refreshIdentity;
exports.requireMerchant = requireMerchant;
exports.syncMerchantEntry = syncMerchantEntry;
exports.staffLogin = staffLogin;
exports.merchantPage = merchantPage;
const config_1 = require("../config");
let identity = { role: 'customer', storeId: config_1.cloudConfig.storeId };
let initialized = false;
let merchantPreview = false;
// 仅未接云环境的开发工具可预览本机数据，不授予任何云端身份。
function canPreviewMerchant() {
    try {
        return !configured() && wx.getDeviceInfo().platform === 'devtools' && wx.getAccountInfoSync().miniProgram.envVersion === 'develop';
    }
    catch (_) {
        return false;
    }
}
function isMerchantPreview() { return merchantPreview && canPreviewMerchant(); }
function enterMerchantPreview() {
    if (!canPreviewMerchant())
        throw new Error('本地预览仅限微信开发工具');
    merchantPreview = true;
}
function leaveMerchantPreview() { merchantPreview = false; }
function configured() { return !!config_1.cloudConfig.envId.trim(); }
function initAuth() {
    if (!configured() || initialized || !wx.cloud)
        return;
    wx.cloud.init({ env: config_1.cloudConfig.envId });
    initialized = true;
}
function isMerchant() { return identity.role === 'owner' || identity.role === 'staff'; }
function clearIdentity() { identity = { role: 'customer', storeId: config_1.cloudConfig.storeId }; }
async function refreshIdentity() {
    // 权限不从本地存储、页面参数或昵称读取，每次均向云端校验。
    clearIdentity();
    if (!configured())
        return { ...identity };
    initAuth();
    if (!initialized)
        throw new Error('当前微信版本暂不支持云开发');
    try {
        let timer;
        const response = await Promise.race([
            wx.cloud.callFunction({ name: 'identity', data: { storeId: config_1.cloudConfig.storeId } }),
            new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('身份验证超时，请重试')), 10000); })
        ]).finally(() => { if (timer !== undefined)
            clearTimeout(timer); });
        const result = response.result;
        if (!result || result.ok !== true || result.storeId !== config_1.cloudConfig.storeId || !['customer', 'owner', 'staff'].includes(result.role))
            throw new Error('身份校验失败，请重试');
        identity = { role: result.role, storeId: result.storeId, accountId: typeof result.accountId === 'string' ? result.accountId : '' };
        return { ...identity };
    }
    catch (_) {
        clearIdentity();
        throw new Error('身份验证未完成，请检查云环境配置后重试');
    }
}
async function requireMerchant() {
    if (isMerchantPreview())
        return;
    const current = await refreshIdentity();
    if (!['owner', 'staff'].includes(current.role))
        throw new Error(configured() ? '当前微信尚未获得这家门店的管理权限' : '尚未配置微信云环境，商家管理暂未开放');
}
function syncMerchantEntry(page) {
    page.setData({ merchantVisible: false });
    void refreshIdentity().then(() => page.setData({ merchantVisible: isMerchant() })).catch(() => page.setData({ merchantVisible: false }));
}
function staffLogin() { wx.navigateTo({ url: '/pages/staff-login/index' }); }
// 页面守卫负责阻止直接路由进入及过期身份操作。真正的云端业务也必须逐次鉴权。
function merchantPage(options) {
    const guarded = { ...options, data: { ...options.data, authorized: false } };
    for (const key of Object.keys(options)) {
        const fn = options[key];
        if (typeof fn !== 'function')
            continue;
        if (key === 'refresh') {
            guarded[key] = function (...args) { if (this.data.authorized)
                return fn.apply(this, args); };
            continue;
        }
        if (key === 'onHide' || key === 'onUnload') {
            guarded[key] = fn;
            continue;
        }
        guarded[key] = async function (...args) {
            if (key === 'onLoad' || key === 'onShow')
                this.setData({ authorized: false });
            try {
                await requireMerchant();
            }
            catch (e) {
                this.setData({ authorized: false, dishes: [], categories: [], orders: [], receipt: null, categoryOpen: false });
                wx.showToast({ title: e.message, icon: 'none' });
                wx.redirectTo({ url: '/pages/staff-login/index' });
                return;
            }
            this.setData({ authorized: true, simulatorPreview: isMerchantPreview() });
            try {
                return await fn.apply(this, args);
            }
            catch (e) {
                wx.showToast({ title: e.message || '云端操作未完成', icon: 'none' });
            }
        };
    }
    if (!options.onShow) {
        guarded.onShow = async function () {
            this.setData({ authorized: false });
            try {
                await requireMerchant();
                this.setData({ authorized: true, simulatorPreview: isMerchantPreview() });
            }
            catch (_) {
                wx.redirectTo({ url: '/pages/staff-login/index' });
            }
        };
    }
    const onHide = options.onHide;
    guarded.onHide = function () { this.setData({ authorized: false }); if (onHide)
        onHide.call(this); };
    return guarded;
}
