import { syncMerchant } from '../../utils/cloud-repository';
import { merchantPage } from '../../utils/auth';
import { read, categoriesWithCount, setDishStatus, deleteDish, money } from '../../utils/cloud-repository';
Page(merchantPage({
  data: { keyword: '', statusFilter: 'all', categories: [] as any[], dishes: [] as any[], categoryId: 'all', totalCount: 0, sellingCount: 0, soldCount: 0, offCount: 0 },
  async onLoad(options: any) {
    await syncMerchant();
    if (options.section === 'categories') { wx.redirectTo({ url: '/pages/category-manage/index' }); return; }
    if (options.categoryId) this.setData({ categoryId: options.categoryId });
    this.refresh();
  },
  async onShow() { await syncMerchant(); this.refresh(); },
  refresh() {
    const s = read(); let id = this.data.categoryId;
    if (id !== 'all' && !s.categories.some(c => c.id === id)) id = 'all';
    const dishes = s.dishes.map(d => {
      const category = s.categories.find(c => c.id === d.categoryId);
      return { ...d, priceText: money(d.price), categoryName: category?.name || '', categoryOff: category?.onSale === false,
        state: !d.onSale ? 'off' : d.soldOut ? 'sold' : 'selling' };
    });
    const keyword = this.data.keyword.trim();
    this.setData({ categories: categoriesWithCount(), categoryId: id, totalCount: dishes.length,
      sellingCount: dishes.filter(d => d.state === 'selling').length, soldCount: dishes.filter(d => d.state === 'sold').length, offCount: dishes.filter(d => d.state === 'off').length,
      dishes: dishes.filter(d => (id === 'all' || d.categoryId === id) && (!keyword || d.name.includes(keyword)) && (this.data.statusFilter === 'all' || d.state === this.data.statusFilter)) });
  },
  search(e: any) { this.setData({ keyword: e.detail.value }); this.refresh(); },
  statusFilter(e: any) { this.setData({ statusFilter: e.currentTarget.dataset.id }); this.refresh(); },
  category(e: any) { this.setData({ categoryId: e.currentTarget.dataset.id }); this.refresh(); },
  addDish() {
    if (!read().categories.length) { wx.showModal({ title: '先创建一个分区', content: '新菜品需要归属分区，创建后即可添加。', confirmText: '创建分区', success: async (r: any) => { if (r.confirm) this.openCategories(); } }); return; }
    wx.navigateTo({ url: '/pages/dish-edit/index' + (this.data.categoryId === 'all' ? '' : `?categoryId=${this.data.categoryId}`) });
  },
  editDish(e: any) { wx.navigateTo({ url: '/pages/dish-edit/index?id=' + e.currentTarget.dataset.id }); },
  async status(e: any) {
    const { id, field } = e.currentTarget.dataset;
    await setDishStatus(id, field); this.refresh(); wx.showToast({ title: '菜品状态已更新', icon: 'success' });
  },
  deleteDish(e: any) {
    const dish = read().dishes.find(d => d.id === e.currentTarget.dataset.id); if (!dish) return;
    wx.showModal({ title: `删除「${dish.name}」？`, content: '删除后无法恢复，将从菜单和当前购物车移除，历史订单保留。', confirmText: '删除菜品', confirmColor: '#b84c32', success: async (r: any) => { if (r.confirm) { await deleteDish(dish.id); this.refresh(); wx.showToast({ title: '菜品已删除' }); } } });
  },
  openCategories() { wx.navigateTo({ url: '/pages/category-manage/index' }); }
}));
