"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.statusNames = exports.selectDemoTable = exports.clearCart = exports.changeDishQuantity = exports.changeCart = exports.categoriesWithCount = exports.cartView = exports.money = exports.read = void 0;
exports.call = call;
exports.syncCatalog = syncCatalog;
exports.syncOrders = syncOrders;
exports.syncMerchant = syncMerchant;
exports.uploadDishImage = uploadDishImage;
exports.saveDish = saveDish;
exports.deleteDish = deleteDish;
exports.setDishStatus = setDishStatus;
exports.saveCategory = saveCategory;
exports.deleteCategory = deleteCategory;
exports.moveCategory = moveCategory;
exports.setCategoryStatus = setCategoryStatus;
exports.saveShop = saveShop;
exports.saveTable = saveTable;
exports.deleteTable = deleteTable;
exports.savePrinter = savePrinter;
exports.submitOrder = submitOrder;
exports.payDemo = payDemo;
exports.updateOrder = updateOrder;
exports.merchantOrderAction = merchantOrderAction;
exports.orderView = orderView;
const config_1 = require("../config");
const auth_1 = require("./auth");
const table_service_1 = require("./table-service");
const local = require("./store");
var store_1 = require("./store");
Object.defineProperty(exports, "read", { enumerable: true, get: function () { return store_1.read; } });
Object.defineProperty(exports, "money", { enumerable: true, get: function () { return store_1.money; } });
Object.defineProperty(exports, "cartView", { enumerable: true, get: function () { return store_1.cartView; } });
Object.defineProperty(exports, "categoriesWithCount", { enumerable: true, get: function () { return store_1.categoriesWithCount; } });
Object.defineProperty(exports, "changeCart", { enumerable: true, get: function () { return store_1.changeCart; } });
Object.defineProperty(exports, "changeDishQuantity", { enumerable: true, get: function () { return store_1.changeDishQuantity; } });
Object.defineProperty(exports, "clearCart", { enumerable: true, get: function () { return store_1.clearCart; } });
Object.defineProperty(exports, "selectDemoTable", { enumerable: true, get: function () { return store_1.selectDemoTable; } });
Object.defineProperty(exports, "statusNames", { enumerable: true, get: function () { return store_1.statusNames; } });
const enabled = () => config_1.cloudConfig.businessCloud === true;
let version;
let customerOrders = [], merchantOrders = [];
let pendingSubmit = null;
const messages = {
    FEE_CHANGED: '收费已更新，请重新查看并确认', DINING_FEES_NOT_CONFIGURED: '餐具及纸巾收费尚未设置，请联系店员', INVALID_DINING: '人数为1至99，餐具和纸巾数量为0至99', INVALID_FEE: '请填写有效的餐具及纸巾单价', DINING_REQUIRED: '请先确认用餐人数和餐具数量', FORBIDDEN: '当前微信无权执行此操作', UNAUTHENTICATED: '请在微信中重新打开小程序', OWNER_REQUIRED: '仅店主可执行',
    STORE_UNAVAILABLE: '门店暂不可用', STORE_CLOSED: '门店休息中，暂不接单', VERSION_CONFLICT: '数据已更新，请刷新后重试',
    DISH_UNAVAILABLE: '菜品已下架或售罄，请刷新菜单', CATEGORY_NOT_EMPTY: '请先移动或删除分区里的菜品',
    DUPLICATE_NAME: '名称已经存在', TABLE_BUSY: '该桌还有未完成订单，暂不能修改', LAST_TABLE: '至少保留一张桌台',
    INVALID_ORDER_TRANSITION: '订单状态已变化，请刷新', PAYMENT_MUST_BE_CLOSED: '请先处理订单支付', INVALID_IMAGE: '请先上传菜品图片',
    REQUEST_REUSED: '提交内容已变化，请重新下单', SESSION_REQUIRED: '请先扫描桌码', SESSION_CLOSED: '本次用餐已结束，请重新扫码', NOT_INITIALIZED: '云端菜单尚未初始化'
};
async function call(action, payload = {}, expectedVersion) {
    (0, auth_1.initAuth)();
    if (!wx.cloud)
        throw new Error('当前微信版本不支持云开发');
    let response;
    try {
        response = await wx.cloud.callFunction({ name: 'restaurant', data: { action, payload, ...(expectedVersion === undefined ? {} : { expectedVersion }) } });
    }
    catch (_) {
        throw new Error('云端连接失败，请稍后重试');
    }
    const result = response === null || response === void 0 ? void 0 : response.result;
    if (!(result === null || result === void 0 ? void 0 : result.ok)) {
        const error = new Error(messages[result === null || result === void 0 ? void 0 : result.code] || '云端操作未完成，请刷新后重试');
        error.cloudCode = result === null || result === void 0 ? void 0 : result.code;
        throw error;
    }
    return result.data;
}
function applyCatalog(snapshot) { version = snapshot.version; local.cacheCloudCatalog(snapshot); }
async function syncCatalog(merchant = false) {
    if (!enabled())
        return;
    applyCatalog(await call(merchant ? 'snapshot' : 'catalog'));
}
async function syncOrders(merchant = false) {
    if (!enabled())
        return;
    const orders = await call('orders', { merchant });
    if (merchant)
        merchantOrders = orders;
    else
        customerOrders = orders;
}
async function syncMerchant() { await Promise.all([syncCatalog(true), syncOrders(true)]); }
async function mutation(action, payload) {
    try {
        applyCatalog(await call(action, payload, version));
    }
    catch (e) {
        await syncCatalog(true).catch(() => { });
        throw e;
    }
}
async function uploadDishImage(filePath) {
    if (!enabled() || filePath.startsWith('cloud://'))
        return filePath;
    (0, auth_1.initAuth)();
    const content = wx.getFileSystemManager().readFileSync(filePath, 'base64');
    return await call('uploadImage', { content });
}
async function saveDish(dish) { if (!enabled())
    return local.saveDish(dish); const image = await uploadDishImage(dish.image); await mutation('saveDish', { dish: { ...dish, image } }); }
async function deleteDish(id) { if (!enabled())
    return local.deleteDish(id); await mutation('deleteDish', { id }); }
async function setDishStatus(id, field) { if (!enabled())
    return local.setDishStatus(id, field); await mutation('setDishStatus', { id, field }); }
async function saveCategory(id, name) { if (!enabled())
    return local.saveCategory(id, name); await mutation('saveCategory', { id, name }); }
async function deleteCategory(id) { if (!enabled())
    return local.deleteCategory(id); await mutation('deleteCategory', { id }); }
async function moveCategory(id, direction) { if (!enabled())
    return local.moveCategory(id, direction); await mutation('moveCategory', { id, direction }); }
async function setCategoryStatus(id) { if (!enabled())
    return local.setCategoryStatus(id); await mutation('setCategoryStatus', { id }); }
async function saveShop(shop) { if (!enabled())
    return local.saveShop(shop); await mutation('saveShop', { shop }); }
async function saveTable(id, name) { if (!enabled())
    return local.saveTable(id, name); await mutation('saveTable', { id, name }); }
async function deleteTable(id) { if (!enabled())
    return local.deleteTable(id); await mutation('deleteTable', { id }); }
async function savePrinter(printer) { if (!enabled())
    return local.savePrinter(printer); await mutation('savePrinter', { printer }); }
async function submitOrder(note) {
    if (!enabled())
        return local.submitOrder(note);
    const state = local.read();
    const binding = (0, table_service_1.tableState)().binding;
    if (!binding)
        throw new Error('请先扫描桌码');
    const lines = state.cart.map(c => ({ dishId: c.dishId, flavor: c.flavor, quantity: c.quantity }));
    const payload = { tableId: binding.tableId, sessionId: binding.sessionId, note: note.trim().slice(0, 100), lines };
    const fingerprint = JSON.stringify(payload);
    const stored = wx.getStorageSync('charcoal-pending-cloud-order');
    if (!pendingSubmit && (stored === null || stored === void 0 ? void 0 : stored.fingerprint) && (stored === null || stored === void 0 ? void 0 : stored.requestId))
        pendingSubmit = stored;
    // After a timeout the same submission is retried first, even if the local cart has since changed.
    if (pendingSubmit && pendingSubmit.fingerprint !== fingerprint)
        throw new Error('上一笔提交结果未确认，请恢复原购物车并重试');
    if (!pendingSubmit) {
        pendingSubmit = { fingerprint, requestId: `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}` };
        wx.setStorageSync('charcoal-pending-cloud-order', pendingSubmit);
    }
    let order;
    try {
        order = await call('submitOrder', { ...payload, requestId: pendingSubmit.requestId });
    }
    catch (e) {
        if (e.cloudCode && e.cloudCode !== 'SERVICE_UNAVAILABLE') {
            pendingSubmit = null;
            wx.setStorageSync('charcoal-pending-cloud-order', null);
        }
        throw e;
    }
    pendingSubmit = null;
    wx.setStorageSync('charcoal-pending-cloud-order', null);
    customerOrders = [order, ...customerOrders.filter(o => o.id !== order.id)];
    local.clearCart();
    return order;
}
async function payDemo(id) { if (!enabled())
    return local.payDemo(id); await call('payDemo', { id }); await syncOrders(false); }
async function updateOrder(id, status) {
    if (!enabled())
        return local.updateOrder(id, status);
    const order = customerOrders.find(o => o.id === id);
    await call('cancelCustomerOrder', { id, status, version: order === null || order === void 0 ? void 0 : order.version });
    await syncOrders(false);
}
async function merchantOrderAction(id, status) {
    if (!enabled())
        return status === 'cancelled' ? local.cancelMerchantOrder(id) : local.updateOrder(id, status);
    const order = merchantOrders.find(o => o.id === id);
    await call('updateOrder', { id, status, version: order === null || order === void 0 ? void 0 : order.version });
    await syncOrders(true);
}
function orderView(merchant = false) {
    if (!enabled())
        return local.orderView();
    return (merchant ? merchantOrders : customerOrders).map(o => {
        var _a, _b, _c, _d, _e;
        const t = new Date(o.createdAt), pad = (n) => String(n).padStart(2, '0');
        return { ...o, statusText: local.statusNames[o.status], totalText: local.money(o.total), diningFeeText: local.money(((_a = o.dining) === null || _a === void 0 ? void 0 : _a.total) || 0), cutleryFeeText: local.money((((_b = o.dining) === null || _b === void 0 ? void 0 : _b.cutleryPrice) || 0) * (((_c = o.dining) === null || _c === void 0 ? void 0 : _c.cutlery) || 0)), napkinFeeText: local.money((((_d = o.dining) === null || _d === void 0 ? void 0 : _d.napkinPrice) || 0) * (((_e = o.dining) === null || _e === void 0 ? void 0 : _e.napkins) || 0)), timeText: `${pad(t.getMonth() + 1)}-${pad(t.getDate())} ${pad(t.getHours())}:${pad(t.getMinutes())}`, items: o.items.map(i => ({ ...i, priceText: local.money(i.price * i.quantity) })) };
    });
}
