"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const auth_1 = require("../../utils/auth");
const order_page_1 = require("../../utils/order-page");
const cloud_repository_1 = require("../../utils/cloud-repository");
const table_service_1 = require("../../utils/table-service");
const base = (0, order_page_1.orderPage)(true);
Page((0, auth_1.merchantPage)({
    ...base,
    data: { ...base.data, filter: 'pending', tableScoped: true, tableId: '', tableSessionId: '', tableName: '', tableTotalText: '0.00', unfinishedCount: 0, unpaidCount: 0, tableOccupied: false, sessionEnded: false, tableLoading: true, ending: false, error: '' },
    onLoad(options) {
        this.setData({ tableId: options.tableId || '', tableSessionId: options.sessionId || '', filter: 'pending' });
    },
    async pollOrders() {
        clearTimeout(this.orderTimer);
        if (!this.orderPageVisible)
            return;
        try {
            const [result] = await Promise.all([(0, table_service_1.tableCall)('list'), (0, cloud_repository_1.syncOrders)(true)]);
            if (!this.orderPageVisible)
                return;
            const table = result.tables.find((t) => t.id === this.data.tableId);
            if (!table)
                throw new Error('桌台不存在或已删除');
            this.setData({ tableName: table.name, tableOccupied: !!table.currentSessionId,
                sessionEnded: !!this.data.tableSessionId && table.currentSessionId !== this.data.tableSessionId, tableLoading: false, error: '' });
            wx.setNavigationBarTitle({ title: table.name + ' 桌 · 本桌订单' });
            this.refresh();
        }
        catch (e) {
            if (this.orderPageVisible)
                this.setData({ error: e.message, tableLoading: false });
        }
        if (this.orderPageVisible)
            this.orderTimer = setTimeout(() => this.pollOrders(), 5000);
    },
    async onPullDownRefresh() { await this.pollOrders(); wx.stopPullDownRefresh(); },
    endDining() {
        if (this.data.ending || this.data.tableLoading || this.data.sessionEnded || !this.data.tableSessionId)
            return;
        if (this.data.unfinishedCount) {
            wx.showToast({ title: '还有订单未完成，请先处理', icon: 'none' });
            return;
        }
        const unpaid = (0, cloud_repository_1.orderView)(true).filter(o => o.tableId === this.data.tableId && o.sessionId === this.data.tableSessionId && o.status !== 'cancelled' && !o.paid).reduce((sum, o) => sum + o.total, 0);
        wx.showModal({ title: '结束 ' + this.data.tableName + ' 桌用餐？', content: '本桌消费合计 ¥' + this.data.tableTotalText + '，未结金额 ¥' + (0, cloud_repository_1.money)(unpaid) + '。请确认顾客是否已全部结清？确认后将记录结清并结束用餐。', confirmText: '确认结清', cancelText: '尚未结清', success: async (r) => {
                if (!r.confirm || this.data.ending)
                    return;
                this.setData({ ending: true });
                try {
                    await (0, table_service_1.tableCall)('close', { tableId: this.data.tableId, sessionId: this.data.tableSessionId, confirmSettlement: true, expectedTotal: unpaid });
                    (0, table_service_1.clearTableBinding)(this.data.tableSessionId);
                    (0, cloud_repository_1.clearCart)();
                    this.setData({ sessionEnded: true, tableOccupied: false });
                    wx.showToast({ title: '本桌用餐已结束' });
                    await this.pollOrders();
                }
                catch (e) {
                    wx.showToast({ title: e.message, icon: 'none' });
                    await this.pollOrders();
                }
                finally {
                    this.setData({ ending: false });
                }
            }, fail: () => { wx.showToast({ title: '确认弹窗打开失败，请重试', icon: 'none' }); } });
    }
}));
