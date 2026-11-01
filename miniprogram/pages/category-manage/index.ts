import { syncMerchant } from '../../utils/cloud-repository';
import { merchantPage } from '../../utils/auth';
import { read, categoriesWithCount, saveCategory, deleteCategory, moveCategory, setCategoryStatus } from '../../utils/cloud-repository';
Page(merchantPage({
  data: { categories: [] as any[], filter: 'all', totalCount: 0, activeCount: 0, offCount: 0, editorOpen: false, editingId: '', categoryName: '' },
  async onShow() { await syncMerchant(); this.refresh(); },
  refresh() {
    const categories = categoriesWithCount();
    this.setData({ totalCount: categories.length, activeCount: categories.filter(c => c.onSale !== false).length, offCount: categories.filter(c => c.onSale === false).length,
      categories: categories.map((c, index) => ({ ...c, position: index + 1, positionText: String(index + 1).padStart(2, '0'), first: index === 0, last: index === categories.length - 1 })).filter(c => this.data.filter === 'all' || (this.data.filter === 'on' ? c.onSale !== false : c.onSale === false)) });
  },
  filter(e: any) { this.setData({ filter: e.currentTarget.dataset.id }); this.refresh(); },
  addCategory() { this.setData({ editorOpen: true, editingId: '', categoryName: '' }); },
  editCategory(e: any) {
    const category = read().categories.find(c => c.id === e.currentTarget.dataset.id);
    if (category) this.setData({ editorOpen: true, editingId: category.id, categoryName: category.name });
  },
  closeEditor() { this.setData({ editorOpen: false }); },
  noop() {},
  categoryName(e: any) { this.setData({ categoryName: e.detail.value }); },
  async saveCategory() {
    try { await saveCategory(this.data.editingId || null, this.data.categoryName); this.closeEditor(); this.refresh(); wx.showToast({ title: '分区已保存' }); }
    catch (e: any) { wx.showToast({ title: e.message, icon: 'none' }); }
  },
  dishes(e: any) { wx.navigateTo({ url: '/pages/dish-manage/index?categoryId=' + e.currentTarget.dataset.id }); },
  async move(e: any) { await moveCategory(e.currentTarget.dataset.id, Number(e.currentTarget.dataset.direction)); this.refresh(); },
  async status(e: any) {
    const category = read().categories.find(c => c.id === e.currentTarget.dataset.id); if (!category) return;
    const apply = async () => { try { await setCategoryStatus(category.id); this.refresh(); wx.showToast({ title: category.onSale === false ? '分区已上架' : '分区已下架' }); } catch (e: any) { wx.showToast({ title: e.message, icon: 'none' }); } };
    if (category.onSale === false) apply();
    else wx.showModal({ title: `下架「${category.name}」？`, content: '顾客菜单将隐藏此分区及区内全部菜品，区内菜品自身的上下架和售罄状态会保留，可随时重新上架分区。', confirmText: '下架分区', confirmColor: '#b84c32', success: async (r: any) => { if (r.confirm) apply(); } });
  },
  deleteCategory(e: any) {
    const category = categoriesWithCount().find(c => c.id === e.currentTarget.dataset.id); if (!category) return;
    if (category.count) { wx.showModal({ title: '分区内还有菜品', content: '请先在菜品编辑中更换所属分区，或删除区内菜品，再删除此分区。', confirmText: '管理菜品', success: async (r: any) => { if (r.confirm) this.dishes(e); } }); return; }
    wx.showModal({ title: `删除「${category.name}」？`, content: '删除后无法恢复，其他分区不受影响。', confirmText: '删除分区', confirmColor: '#b84c32', success: async (r: any) => {
      if (!r.confirm) return;
      try { await deleteCategory(category.id); this.refresh(); wx.showToast({ title: '分区已删除' }); } catch (e: any) { wx.showToast({ title: e.message, icon: 'none' }); }
    } });
  }
}));
