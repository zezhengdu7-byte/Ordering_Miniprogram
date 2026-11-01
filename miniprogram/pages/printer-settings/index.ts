import { syncMerchant } from '../../utils/cloud-repository';
import { merchantPage } from '../../utils/auth';
import { read, savePrinter } from '../../utils/cloud-repository';
Page(merchantPage({
  data: { name: '', serial: '', copies: 1, autoPrint: false, testOpen: false, shopName: '' },
  async onLoad() { await syncMerchant(); const s = read(); this.setData({ ...s.printer, shopName: s.shop.name }); },
  input(e: any) { this.setData({ [e.currentTarget.dataset.field]: e.detail.value }); },
  copies(e: any) { this.setData({ copies: Number(e.currentTarget.dataset.value) }); },
  toggle(e: any) { this.setData({ autoPrint: e.detail.value }); },
  async save() {
    try { const d = this.data; await savePrinter({ name: d.name, serial: d.serial, copies: d.copies, autoPrint: d.autoPrint }); wx.showToast({ title: '演示设置已保存' }); }
    catch (e: any) { wx.showToast({ title: e.message, icon: 'none' }); }
  },
  test() { this.setData({ testOpen: true }); },
  close() { this.setData({ testOpen: false }); },
  noop() {},
  orders() { wx.navigateTo({ url: '/pages/admin-orders/index' }); }
}));
