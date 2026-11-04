"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const cloud_repository_1 = require("../../utils/cloud-repository");
const auth_1 = require("../../utils/auth");
const cloud_repository_2 = require("../../utils/cloud-repository");
Page((0, auth_1.merchantPage)({
    data: { shopName: '', open: true, todayTableCount: 0, paidText: '0.00', pendingCount: 0, makingCount: 0, dishCount: 0, categoryCount: 0, tableCount: 0, dateText: '' },
    async onShow() { await (0, cloud_repository_1.syncMerchant)(); this.refresh(); },
    retryAuth() { this.refresh(); },
    refresh() {
        const s = (0, cloud_repository_2.read)(), now = new Date();
        const orders = (0, cloud_repository_2.orderView)(true);
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const today = orders.filter(o => o.status !== 'cancelled' && (o.createdAt >= start || (o.paid && (o.settledAt || o.createdAt) >= start)));
        const settledToday = orders.filter(o => o.status !== 'cancelled' && o.paid && (o.settledAt || o.createdAt) >= start);
        const todayTableCount = new Set(today.map(o => o.sessionId || o.tableId || o.table).filter(Boolean)).size;
        this.setData({ shopName: s.shop.name, open: s.shop.open, todayTableCount, paidText: (0, cloud_repository_2.money)(settledToday.reduce((n, o) => n + o.total, 0)), pendingCount: orders.filter(o => o.status === 'pending').length, makingCount: orders.filter(o => o.status === 'accepted').length, dishCount: s.dishes.length, categoryCount: s.categories.length, tableCount: s.tables.length, dateText: `${now.getMonth() + 1}月${now.getDate()}日` });
    },
    go(e) {
        const routes = { dishes: '/pages/dish-manage/index', categories: '/pages/category-manage/index', orders: '/pages/admin-orders/index', pending: '/pages/admin-orders/index?filter=pending', making: '/pages/admin-orders/index?filter=accepted', tables: '/pages/table-manage/index', shop: '/pages/shop-settings/index', qr: '/pages/qr-manage/index', printer: '/pages/printer-settings/index' };
        const url = routes[e.currentTarget.dataset.page];
        if (url)
            wx.navigateTo({ url });
    },
    preview() { (0, auth_1.leaveMerchantPreview)(); wx.switchTab({ url: '/pages/menu/index' }); }
}));
