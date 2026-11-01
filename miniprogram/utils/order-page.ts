import type { Order } from './store';
import { read, orderView, payDemo, updateOrder, merchantOrderAction, syncOrders } from './cloud-repository';
export function orderPage(merchant: boolean) {
  return {
    data: { keyword: '', shopName: '', merchant, orders: [] as any[], filter: 'all', filters: [{ id: 'all', name: '全部' }, { id: 'pending', name: '待接单' }, { id: 'accepted', name: '制作中' }, { id: 'completed', name: '已完成' }, ...(merchant ? [{ id: 'cancelled', name: '已取消' }] : [])], pendingCount: 0, makingCount: 0, completedCount: 0, cancelledCount: 0, receipt: null as any },
    onLoad(options: any) { if (merchant && ['all','pending','accepted','completed','cancelled'].includes(options.filter)) this.setData({ filter: options.filter }); },
    async onShow() {
      this.orderPageVisible = true;
      await this.pollOrders();
    },
    onHide() { this.orderPageVisible = false; if (this.orderTimer) clearTimeout(this.orderTimer); },
    onUnload() { this.orderPageVisible = false; if (this.orderTimer) clearTimeout(this.orderTimer); },
    async pollOrders() {
      if (!this.orderPageVisible) return;
      try { await syncOrders(merchant); if (this.orderPageVisible) this.refresh(); }
      catch (e: any) { if (this.orderPageVisible) wx.showToast({ title: e.message, icon: 'none' }); }
      if (this.orderPageVisible) this.orderTimer = setTimeout(() => this.pollOrders(), 5000);
    },
    refresh() {
      const all = orderView(merchant), keyword = this.data.keyword.trim().toLowerCase();
      this.setData({ shopName: read().shop.name, pendingCount: all.filter(o => o.status === 'pending').length, makingCount: all.filter(o => o.status === 'accepted').length, completedCount: all.filter(o => o.status === 'completed').length, cancelledCount: all.filter(o => o.status === 'cancelled').length, orders: all.filter(o => (this.data.filter === 'all' || o.status === this.data.filter) && (!merchant || !keyword || [o.number, o.table, o.note, ...o.items.map(i => i.name)].some(v => v.toLowerCase().includes(keyword)))) });
    },
    search(e: any) { this.setData({ keyword: e.detail.value }); this.refresh(); },
    filter(e: any) { this.setData({ filter: e.currentTarget.dataset.id }); this.refresh(); },
    toMenu() { wx.switchTab({ url: '/pages/menu/index' }); },
    pay(e: any) {
      const id = e.currentTarget.dataset.id;
      wx.showModal({ title: '模拟付款，不会扣款', content: '此操作只把订单标记为“已模拟付款”，未接入微信支付。', confirmText: '模拟付款', success: async (r: any) => {
        if (!r.confirm) return; try { await payDemo(id); this.refresh(); wx.showToast({ title: '模拟付款完成' }); } catch (e: any) { wx.showToast({ title: e.message, icon: 'none' }); }
      } });
    },
    action(e: any) {
      const { id, status } = e.currentTarget.dataset;
      const apply = async () => { try { if (merchant) await merchantOrderAction(id, status as Order['status']); else await updateOrder(id, status as Order['status']); this.refresh(); } catch (e: any) { wx.showToast({ title: e.message, icon: 'none' }); } };
      if (status === 'cancelled') wx.showModal({ title: '确认取消订单？', content: '取消后将停止制作，订单及菜品记录保留。模拟付款记录保留，此操作不涉及真实扣款或退款。', confirmText: '取消订单', confirmColor: '#b84c32', success: async (r: any) => { if (r.confirm) await apply(); } });
      else apply();
    },
    receipt(e: any) { const order = orderView(merchant).find(o => o.id === e.currentTarget.dataset.id); this.setData({ receipt: order || null }); },
    closeReceipt() { this.setData({ receipt: null }); },
    noop() {}
  };
}
