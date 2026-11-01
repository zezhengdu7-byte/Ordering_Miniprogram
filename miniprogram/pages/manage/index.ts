import { syncMerchant } from '../../utils/cloud-repository';
import { merchantPage, leaveMerchantPreview } from '../../utils/auth';
import { read, money, orderView } from '../../utils/cloud-repository';
Page(merchantPage({
  data: { shopName: '', open: true, todayCount: 0, paidText: '0.00', pendingCount: 0, makingCount: 0, dishCount: 0, categoryCount: 0, tableCount: 0, dateText: '' },
  async onShow() { await syncMerchant(); this.refresh(); },
  retryAuth() { this.refresh(); },
  refresh() {
    const s = read(), now = new Date(); const orders = orderView(true); const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const today = orders.filter(o => o.createdAt >= start && o.status !== 'cancelled');
    this.setData({ shopName: s.shop.name, open: s.shop.open, todayCount: today.length, paidText: money(today.filter(o => o.paid).reduce((n,o) => n + o.total, 0)), pendingCount: orders.filter(o => o.status === 'pending').length, makingCount: orders.filter(o => o.status === 'accepted').length, dishCount: s.dishes.length, categoryCount: s.categories.length, tableCount: s.tables.length, dateText: `${now.getMonth()+1}月${now.getDate()}日` });
  },
  go(e: any) {
    const routes: Record<string,string> = { dishes: '/pages/dish-manage/index', categories: '/pages/category-manage/index', orders: '/pages/admin-orders/index', pending: '/pages/admin-orders/index?filter=pending', making: '/pages/admin-orders/index?filter=accepted', shop: '/pages/shop-settings/index', tables: '/pages/table-manage/index', printer: '/pages/printer-settings/index' };
    const url = routes[e.currentTarget.dataset.page]; if (url) wx.navigateTo({ url });
  },
  preview() { leaveMerchantPreview(); wx.switchTab({ url: '/pages/menu/index' }); }
}));
