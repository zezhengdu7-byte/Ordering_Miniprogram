"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.payDemo = exports.cancelMerchantOrder = exports.updateOrder = exports.setCategoryStatus = exports.moveCategory = exports.deleteCategory = exports.saveCategory = exports.setDishStatus = exports.deleteDish = exports.saveDish = void 0;
exports.syncCloud = syncCloud;
exports.submitOrder = submitOrder;
const config_1 = require("../config");
const local = require("./store");
const auth_1 = require("./auth");
let revision;
const enabled = () => !!config_1.cloudConfig.envId && config_1.cloudConfig.businessEnabled;
let syncTask = null;
async function call(action, args = [], requestId = '') {
    (0, auth_1.initAuth)();
    const response = await wx.cloud.callFunction({ name: 'business', data: { storeId: config_1.cloudConfig.storeId, action, args, requestId, revision } });
    const result = response.result;
    if (!result || !result.ok) {
        const error = new Error((result === null || result === void 0 ? void 0 : result.message) || ((result === null || result === void 0 ? void 0 : result.code) === 'NOT_INITIALIZED' ? '云端菜单尚未初始化，请由商家进入工作台同步' : '云端连接失败，请重试'));
        error.code = result === null || result === void 0 ? void 0 : result.code;
        error.merchant = result === null || result === void 0 ? void 0 : result.merchant;
        throw error;
    }
    return result;
}
async function syncCloud() {
    if (!enabled())
        return;
    if (syncTask)
        return syncTask;
    syncTask = (async () => {
        let result;
        try {
            result = await call('read');
        }
        catch (e) {
            if (e.code !== 'NOT_INITIALIZED' || !e.merchant)
                throw e;
            const state = local.read();
            const dishes = [];
            for (const d of state.dishes)
                dishes.push(await cloudDish(d));
            await call('bootstrap', [{ categories: state.categories, dishes }], token());
            result = await call('read');
        }
        revision = result.revision;
        local.cacheCloudState(result.state);
    })().finally(() => { syncTask = null; });
    return syncTask;
}
function token() { return `r-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`; }
async function cloudDish(dish) {
    if (dish.image.startsWith('/assets/') || dish.image.startsWith('cloud://'))
        return dish;
    const upload = await wx.cloud.uploadFile({ cloudPath: `menu/${config_1.cloudConfig.storeId}/${token()}.jpg`, filePath: dish.image });
    return { ...dish, image: upload.fileID };
}
// Reuse a request ID if a network response is lost; server receipts prevent duplicate orders or toggles.
async function mutate(action, args) {
    if (!enabled())
        return local[action](...args);
    const key = 'charcoal-cloud-pending';
    const serialized = JSON.stringify({ action, args });
    const pending = wx.getStorageSync(key);
    const requestId = (pending === null || pending === void 0 ? void 0 : pending.serialized) === serialized ? pending.requestId : token();
    wx.setStorageSync(key, { serialized, requestId });
    let response;
    try {
        response = await call(action, args, requestId);
    }
    catch (e) {
        if (e.code)
            wx.removeStorageSync(key);
        throw e;
    }
    wx.removeStorageSync(key);
    // A refresh failure must not turn a successfully committed order into a failed submission.
    try {
        await syncCloud();
    }
    catch (_) {
        wx.showToast({ title: '已保存云端，列表刷新失败，请重新进入', icon: 'none' });
    }
    return response.result;
}
const saveDish = async (dish) => mutate('saveDish', [enabled() ? await cloudDish(dish) : dish]);
exports.saveDish = saveDish;
const deleteDish = (id) => mutate('deleteDish', [id]);
exports.deleteDish = deleteDish;
const setDishStatus = (id, field) => mutate('setDishStatus', [id, field]);
exports.setDishStatus = setDishStatus;
const saveCategory = (id, name) => mutate('saveCategory', [id, name]);
exports.saveCategory = saveCategory;
const deleteCategory = (id) => mutate('deleteCategory', [id]);
exports.deleteCategory = deleteCategory;
const moveCategory = (id, direction) => mutate('moveCategory', [id, direction]);
exports.moveCategory = moveCategory;
const setCategoryStatus = (id) => mutate('setCategoryStatus', [id]);
exports.setCategoryStatus = setCategoryStatus;
const updateOrder = (id, status) => mutate('updateOrder', [id, status]);
exports.updateOrder = updateOrder;
const cancelMerchantOrder = (id) => mutate('cancelMerchantOrder', [id]);
exports.cancelMerchantOrder = cancelMerchantOrder;
const payDemo = (id) => mutate('payDemo', [id]);
exports.payDemo = payDemo;
async function submitOrder(note) {
    if (!enabled())
        return local.submitOrder(note);
    const state = local.read();
    const order = await mutate('submitOrder', [{ cart: state.cart.map(({ dishId, flavor, quantity }) => ({ dishId, flavor, quantity })), table: state.currentTable, note }]);
    local.clearCart();
    return order;
}
