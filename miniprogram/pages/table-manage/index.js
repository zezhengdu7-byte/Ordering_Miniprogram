"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const auth_1 = require("../../utils/auth");
const cloud_repository_1 = require("../../utils/cloud-repository");
const table_service_1 = require("../../utils/table-service");
const statusText = { pending: '待接单', accepted: '制作中', completed: '已完成', cancelled: '已取消' };
Page((0, auth_1.merchantPage)({
    data: {
        tables: [], totalCount: 0, occupiedCount: 0,
        currentTotalText: '0.00', currentOrderCount: 0, pendingCount: 0, error: ''
    },
    async onShow() { await this.refresh(); },
    async onPullDownRefresh() {
        await this.refresh();
        wx.stopPullDownRefresh();
    },
    async refresh() {
        try {
            const [tableResult] = await Promise.all([(0, table_service_1.tableCall)('list'), (0, cloud_repository_1.syncOrders)(true)]);
            const allOrders = (0, cloud_repository_1.orderView)(true);
            let currentOrderCount = 0, pendingCount = 0, currentTotal = 0;
            const tables = tableResult.tables.map((table) => {
                const tableOrders = table.currentSessionId ? allOrders.filter(order => order.tableId === table.id && order.sessionId === table.currentSessionId) : [];
                const validOrders = tableOrders.filter(order => order.status !== 'cancelled');
                const total = validOrders.reduce((sum, order) => sum + order.total, 0);
                currentOrderCount += validOrders.length;
                pendingCount += validOrders.filter(order => order.status === 'pending').length;
                currentTotal += total;
                return {
                    ...table,
                    occupied: !!table.currentSessionId,
                    orderCount: validOrders.length,
                    totalText: (0, cloud_repository_1.money)(total),
                    pendingCount: validOrders.filter(order => order.status === 'pending').length,
                    orders: tableOrders.map(order => ({
                        ...order,
                        statusText: statusText[order.status] || order.status,
                        totalText: (0, cloud_repository_1.money)(order.total),
                        sourceText: order.source === 'merchant-assist' ? '商家代下' : '顾客扫码'
                    }))
                };
            });
            this.setData({
                tables, error: '', totalCount: tables.length,
                occupiedCount: tables.filter((table) => table.occupied).length,
                currentTotalText: (0, cloud_repository_1.money)(currentTotal), currentOrderCount, pendingCount
            });
        }
        catch (e) {
            this.setData({ error: e.message || '桌台数据加载失败' });
        }
    },
    openTable(e) {
        const table = this.data.tables.find((t) => t.id === e.currentTarget.dataset.id);
        if (!table)
            return;
        wx.navigateTo({ url: '/pages/table-orders/index?tableId=' + encodeURIComponent(table.id) + '&sessionId=' + encodeURIComponent(table.currentSessionId || '') });
    },
    async assist(e) {
        var _a;
        if (this.enteringTable)
            return;
        this.enteringTable = true;
        try {
            const tableId = e.currentTarget.dataset.id;
            const target = this.data.tables.find((t) => t.id === tableId);
            const sameSession = !!(target === null || target === void 0 ? void 0 : target.currentSessionId) && target.currentSessionId === ((_a = (0, table_service_1.tableState)().binding) === null || _a === void 0 ? void 0 : _a.sessionId);
            if (!sameSession && (0, cloud_repository_1.read)().cart.length) {
                const confirmed = await new Promise(resolve => wx.showModal({
                    title: '切换点单桌台', content: '当前购物车还有菜品，切换桌台将清空这些菜品。',
                    success: (r) => resolve(r.confirm), fail: () => resolve(false)
                }));
                if (!confirmed)
                    return;
            }
            await (0, table_service_1.enterMerchantTable)(tableId);
            if (!sameSession)
                (0, cloud_repository_1.clearCart)();
            wx.switchTab({ url: '/pages/menu/index' });
        }
        finally {
            this.enteringTable = false;
        }
    },
    qr() { wx.navigateTo({ url: '/pages/qr-manage/index' }); }
}));
