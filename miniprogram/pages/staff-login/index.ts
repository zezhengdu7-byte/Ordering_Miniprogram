import { configured, refreshIdentity, canPreviewMerchant, enterMerchantPreview } from '../../utils/auth';
Page({
  data: { showPreview: canPreviewMerchant(), configured: configured(), loading: false, message: '', role: '', accountId: '' },
  onShow() { this.setData({ showPreview: canPreviewMerchant(), configured: configured(), message: '', role: '', accountId: '' }); },
  async verify() {
    if (this.data.loading) return;
    if (!configured()) { this.setData({ message: '需要先配置小程序 AppID、云环境并部署身份云函数。当前无法验证店主或员工身份。' }); return; }
    this.setData({ loading: true, message: '', role: '', accountId: '' });
    try {
      const identity = await refreshIdentity();
      this.setData({ accountId: identity.accountId || '' });
      if (identity.role === 'customer') { this.setData({ message: '你的微信尚未绑定这家门店的员工权限，请联系店主添加。' }); return; }
      this.setData({ role: identity.role === 'owner' ? '店主' : '员工' });
      wx.redirectTo({ url: '/pages/manage/index' });
    } catch (e: any) { this.setData({ message: e.message }); }
    finally { this.setData({ loading: false }); }
  },
  preview() { if (!canPreviewMerchant()) return; enterMerchantPreview(); wx.redirectTo({ url: '/pages/manage/index' }); },
  back() { wx.switchTab({ url: '/pages/menu/index' }); }
});
