import { merchantPage } from '../../utils/auth';
import { money, orderView, syncOrders, read, clearCart } from '../../utils/cloud-repository';
import { tableCall, tableState, enterMerchantTable } from '../../utils/table-service';

const statusText: Record<string, string> = { pending: '待接单', accepted: '制作中', completed: '已完成', cancelled: '已取消' };

Page(merchantPage({
  data: {
    tables: [] as any[], totalCount: 0, occupiedCount: 0,
    currentTotalText: '0.00', currentOrderCount: 0, pendingCount: 0, error: ''
  },
  async onShow() { await this.refresh(); },
  async onPullDownRefresh() {
    await this.refresh();
    wx.stopPullDownRefresh();
  },
  async refresh() {
    try {
      const [tableResult] = await Promise.all([tableCall('list'), syncOrders(true)]);
      const allOrders = orderView(true);
      let currentOrderCount = 0, pendingCount = 0, currentTotal = 0;
      const tables = tableResult.tables.map((table: any) => {
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
          totalText: money(total),
          pendingCount: validOrders.filter(order => order.status === 'pending').length,
          orders: tableOrders.map(order => ({
            ...order,
            statusText: statusText[order.status] || order.status,
            totalText: money(order.total),
            sourceText: order.source === 'merchant-assist' ? '商家代下' : '顾客扫码'
          }))
        };
      });
      this.setData({
        tables, error: '', totalCount: tables.length,
        occupiedCount: tables.filter((table: any) => table.occupied).length,
        currentTotalText: money(currentTotal), currentOrderCount, pendingCount
      });
    } catch (e: any) {
      this.setData({ error: e.message || '桌台数据加载失败' });
    }
  },
  openTable(e:any) {
    const table=this.data.tables.find((t:any)=>t.id===e.currentTarget.dataset.id);
    if(!table)return;
    wx.navigateTo({url:'/pages/table-orders/index?tableId='+encodeURIComponent(table.id)+'&sessionId='+encodeURIComponent(table.currentSessionId||'')});
  },
  async assist(e: any) {
    if (this.enteringTable) return;
    this.enteringTable = true;
    try {
      const tableId = e.currentTarget.dataset.id;
      const target = this.data.tables.find((t: any) => t.id === tableId);
      const sameSession = !!target?.currentSessionId && target.currentSessionId === tableState().binding?.sessionId;
      if (!sameSession && read().cart.length) {
        const confirmed = await new Promise<boolean>(resolve => wx.showModal({
          title: '切换点单桌台', content: '当前购物车还有菜品，切换桌台将清空这些菜品。',
          success: (r: any) => resolve(r.confirm), fail: () => resolve(false)
        }));
        if (!confirmed) return;
      }
      await enterMerchantTable(tableId);
      if (!sameSession) clearCart();
      wx.switchTab({ url: '/pages/menu/index' });
    } finally { this.enteringTable = false; }
  },
  qr() { wx.navigateTo({ url: '/pages/qr-manage/index' }); }
}));
