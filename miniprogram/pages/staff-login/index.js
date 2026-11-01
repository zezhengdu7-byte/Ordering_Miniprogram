"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const auth_1 = require("../../utils/auth");
Page({
    data: { showPreview: (0, auth_1.canPreviewMerchant)(), configured: (0, auth_1.configured)(), loading: false, message: '', role: '', accountId: '' },
    onShow() { this.setData({ showPreview: (0, auth_1.canPreviewMerchant)(), configured: (0, auth_1.configured)(), message: '', role: '', accountId: '' }); },
    async verify() {
        if (this.data.loading)
            return;
        if (!(0, auth_1.configured)()) {
            this.setData({ message: '需要先配置小程序 AppID、云环境并部署身份云函数。当前无法验证店主或员工身份。' });
            return;
        }
        this.setData({ loading: true, message: '', role: '', accountId: '' });
        try {
            const identity = await (0, auth_1.refreshIdentity)();
            this.setData({ accountId: identity.accountId || '' });
            if (identity.role === 'customer') {
                this.setData({ message: '你的微信尚未绑定这家门店的员工权限，请联系店主添加。' });
                return;
            }
            this.setData({ role: identity.role === 'owner' ? '店主' : '员工' });
            wx.redirectTo({ url: '/pages/manage/index' });
        }
        catch (e) {
            this.setData({ message: e.message });
        }
        finally {
            this.setData({ loading: false });
        }
    },
    preview() { if (!(0, auth_1.canPreviewMerchant)())
        return; (0, auth_1.enterMerchantPreview)(); wx.redirectTo({ url: '/pages/manage/index' }); },
    back() { wx.switchTab({ url: '/pages/menu/index' }); }
});
