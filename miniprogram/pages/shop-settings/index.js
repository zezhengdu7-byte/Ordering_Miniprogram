"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const cloud_repository_1 = require("../../utils/cloud-repository");
const auth_1 = require("../../utils/auth");
const cloud_repository_2 = require("../../utils/cloud-repository");
Page((0, auth_1.merchantPage)({
    data: { name: '', welcome: '', open: true, cutleryYuan: '', napkinYuan: '' },
    async onLoad() { await (0, cloud_repository_1.syncMerchant)(); const shop = (0, cloud_repository_2.read)().shop; this.setData({ ...shop, cutleryYuan: shop.cutleryPrice == null ? '' : (shop.cutleryPrice / 100).toFixed(2), napkinYuan: shop.napkinPrice == null ? '' : (shop.napkinPrice / 100).toFixed(2) }); },
    input(e) { this.setData({ [e.currentTarget.dataset.field]: e.detail.value }); },
    toggle(e) { this.setData({ open: e.detail.value }); },
    async save() {
        try {
            const price = (value) => { if (!/^\d{1,4}(\.\d{1,2})?$/.test(value.trim()) || Number(value) > 1000)
                throw new Error('请填写0至1000元的单价，最多两位小数'); return Math.round(Number(value) * 100); };
            await (0, cloud_repository_2.saveShop)({ cutleryPrice: price(this.data.cutleryYuan), napkinPrice: price(this.data.napkinYuan), name: this.data.name, welcome: this.data.welcome, open: this.data.open });
            wx.showToast({ title: '店铺设置已保存' });
        }
        catch (e) {
            wx.showToast({ title: e.message, icon: 'none' });
        }
    }
}));
