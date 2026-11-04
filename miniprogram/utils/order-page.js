"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.orderPage = orderPage;
const cloud_repository_1 = require("./cloud-repository");
function orderPage(merchant) {
    return {
        data: { keyword: '', shopName: '', merchant, orders: [], filter: 'all', filters: [{ id: 'pending', name: '待接单' }, { id: 'accepted', name: '制作中' }, { id: 'completed', name: '已完成' }, ...(merchant ? [{ id: 'cancelled', name: '已取消' }] : []), { id: 'all', name: '全部' }], pendingCount: 0, makingCount: 0, completedCount: 0, cancelledCount: 0, bill: null, editing: null, editFlavors: ['不辣', '微辣', '中辣', '特辣'], editSaving: false, settling: false },
        onLoad(options) { if (merchant && ['all', 'pending', 'accepted', 'completed', 'cancelled'].includes(options.filter))
            this.setData({ filter: options.filter }); },
        async onShow() {
            this.orderPageVisible = true;
            await this.pollOrders();
        },
        onHide() { this.orderPageVisible = false; if (this.orderTimer)
            clearTimeout(this.orderTimer); },
        onUnload() { this.orderPageVisible = false; if (this.orderTimer)
            clearTimeout(this.orderTimer); },
        async pollOrders() {
            if (!this.orderPageVisible)
                return;
            if (this.orderTimer)
                clearTimeout(this.orderTimer);
            try {
                await (0, cloud_repository_1.syncOrders)(merchant);
                if (this.orderPageVisible) {
                    this.refresh();
                    if (!merchant) {
                        const bill = await (0, cloud_repository_1.getBill)();
                        if (this.orderPageVisible)
                            this.setData({ bill: bill ? { ...bill, totalText: (0, cloud_repository_1.money)(bill.total) } : null });
                    }
                }
            }
            catch (e) {
                if (this.orderPageVisible)
                    wx.showToast({ title: e.message, icon: 'none' });
            }
            if (this.orderPageVisible)
                this.orderTimer = setTimeout(() => this.pollOrders(), 5000);
        },
        refresh() {
            const all = (0, cloud_repository_1.orderView)(merchant).filter(o => !this.data.tableScoped || (o.tableId === this.data.tableId && o.sessionId === this.data.tableSessionId)), keyword = this.data.keyword.trim().toLowerCase();
            const active = all.filter(o => o.status !== 'cancelled');
            this.setData({ tableTotalText: (0, cloud_repository_1.money)(active.reduce((n, o) => n + o.total, 0)), unfinishedCount: active.filter(o => o.status !== 'completed').length, unpaidCount: active.filter(o => !o.paid).length,
                shopName: (0, cloud_repository_1.read)().shop.name, pendingCount: all.filter(o => o.status === 'pending').length, makingCount: all.filter(o => o.status === 'accepted').length, completedCount: all.filter(o => o.status === 'completed').length, cancelledCount: all.filter(o => o.status === 'cancelled').length, orders: all.filter(o => (this.data.filter === 'all' || o.status === this.data.filter) && (!merchant || !keyword || [o.table, o.note, ...o.items.map(i => i.name)].some(v => v.toLowerCase().includes(keyword)))) });
        },
        search(e) { this.setData({ keyword: e.detail.value }); this.refresh(); },
        filter(e) { this.setData({ filter: e.currentTarget.dataset.id }); this.refresh(); },
        toMenu() { wx.switchTab({ url: '/pages/menu/index' }); },
        pay() {
            var _a;
            if (this.data.settling || !((_a = this.data.bill) === null || _a === void 0 ? void 0 : _a.count) || this.data.bill.unfinished)
                return;
            const expectedTotal = this.data.bill.total;
            wx.showModal({ title: '整桌统一结算', content: '本桌合计 ¥' + this.data.bill.totalText + '，包含同桌顾客的所有未结算订单。结清后本次用餐结束，不能继续下单。本次为模拟付款，不会扣款。', confirmText: '确认结算', success: async (r) => {
                    if (!r.confirm || this.data.settling)
                        return;
                    this.setData({ settling: true });
                    try {
                        await (0, cloud_repository_1.settleTable)(expectedTotal);
                        await this.pollOrders();
                        wx.showToast({ title: '结清并结束用餐' });
                    }
                    catch (e) {
                        wx.showToast({ title: e.message, icon: 'none' });
                        await this.pollOrders();
                    }
                    finally {
                        this.setData({ settling: false });
                    }
                } });
        },
        edit(e) {
            const order = (0, cloud_repository_1.orderView)(merchant).find(o => o.id === e.currentTarget.dataset.id);
            if (!order || !(order.status === 'pending' || merchant && order.status === 'accepted') || order.paid)
                return;
            const items = order.items.map((i) => {
                const dish = (0, cloud_repository_1.read)().dishes.find(d => d.id === i.dishId || (!i.dishId && d.name === i.name));
                return { ...i, canEditFlavor: merchant && !i.service && (dish ? dish.spicy : i.flavor !== '标准'), unitPriceText: (0, cloud_repository_1.money)(i.price), dishId: i.dishId || (dish === null || dish === void 0 ? void 0 : dish.id), minQuantity: i.service ? 1 : Math.max(i.minQuantity || 1, (dish === null || dish === void 0 ? void 0 : dish.minQuantity) || 1, ((dish === null || dish === void 0 ? void 0 : dish.description) || '').includes('5串起点') ? 5 : 1) };
            });
            this.setData({ editing: { ...order, items } });
        },
        editStep(e) {
            if (this.data.editSaving)
                return;
            const editing = this.data.editing;
            if (!editing)
                return;
            const items = editing.items.map((i) => ({ ...i }));
            const index = Number(e.currentTarget.dataset.index), delta = Number(e.currentTarget.dataset.delta);
            if (!items[index] || ![1, -1].includes(delta))
                return;
            let quantity = items[index].quantity + delta;
            if (delta > 0 && !items[index].quantity)
                quantity = items[index].minQuantity;
            if (delta < 0 && quantity < items[index].minQuantity)
                quantity = 0;
            if (quantity < 0 || quantity > 99)
                return;
            items[index].quantity = quantity;
            const total = items.reduce((n, i) => n + i.price * i.quantity, 0);
            this.setData({ editing: { ...editing, items, totalText: (0, cloud_repository_1.money)(total) } });
        },
        editFlavor(e) {
            if (!merchant || this.data.editSaving || !this.data.editing)
                return;
            const index = Number(e.currentTarget.dataset.index);
            const flavor = this.data.editFlavors[Number(e.detail.value)];
            const items = this.data.editing.items.map((i) => ({ ...i }));
            const item = items[index];
            if (!(item === null || item === void 0 ? void 0 : item.canEditFlavor) || !flavor)
                return;
            if (items.some((i, j) => j !== index && i.dishId === item.dishId && i.flavor === flavor && i.quantity > 0)) {
                wx.showToast({ title: '订单中已有该辣度，请调整对应菜品数量', icon: 'none' });
                return;
            }
            item.flavor = flavor;
            this.setData({ editing: { ...this.data.editing, items } });
        },
        editNote(e) { this.setData({ editing: { ...this.data.editing, note: e.detail.value } }); },
        closeEdit() { if (!this.data.editSaving)
            this.setData({ editing: null }); },
        async saveEdit() {
            if (!this.data.editing || this.data.editSaving)
                return;
            const order = this.data.editing;
            if (!order.items.some((i) => !i.service && i.quantity > 0)) {
                wx.showToast({ title: '请至少保留一道菜，或取消订单', icon: 'none' });
                return;
            }
            this.setData({ editSaving: true });
            try {
                await (0, cloud_repository_1.editCustomerOrder)({ ...order, items: order.items.filter((i) => i.quantity > 0) }, merchant);
                this.setData({ editing: null });
                await this.pollOrders();
                wx.showToast({ title: '订单已修改' });
            }
            catch (e) {
                wx.showToast({ title: e.message, icon: 'none' });
                await this.pollOrders();
                const latest = (0, cloud_repository_1.orderView)(merchant).find(o => o.id === order.id);
                if (!latest || latest.paid || !(latest.status === 'pending' || merchant && latest.status === 'accepted'))
                    this.setData({ editing: null });
            }
            finally {
                this.setData({ editSaving: false });
            }
        },
        action(e) {
            const { id, status } = e.currentTarget.dataset;
            const apply = async () => { try {
                if (merchant)
                    await (0, cloud_repository_1.merchantOrderAction)(id, status);
                else
                    await (0, cloud_repository_1.updateOrder)(id, status);
                this.refresh();
                if (!merchant) {
                    const bill = await (0, cloud_repository_1.getBill)();
                    this.setData({ bill: bill ? { ...bill, totalText: (0, cloud_repository_1.money)(bill.total) } : null });
                }
            }
            catch (e) {
                wx.showToast({ title: e.message, icon: 'none' });
            } };
            if (status === 'cancelled')
                wx.showModal({ title: '确认取消订单？', content: '取消后将停止制作，订单及菜品记录保留。模拟付款记录保留，此操作不涉及真实扣款或退款。', confirmText: '取消订单', confirmColor: '#b84c32', success: async (r) => { if (r.confirm)
                        await apply(); } });
            else
                apply();
        },
        noop() { }
    };
}
