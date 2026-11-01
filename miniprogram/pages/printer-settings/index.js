"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const cloud_repository_1 = require("../../utils/cloud-repository");
const auth_1 = require("../../utils/auth");
const cloud_repository_2 = require("../../utils/cloud-repository");
Page((0, auth_1.merchantPage)({
    data: { name: '', serial: '', copies: 1, autoPrint: false, testOpen: false, shopName: '' },
    async onLoad() { await (0, cloud_repository_1.syncMerchant)(); const s = (0, cloud_repository_2.read)(); this.setData({ ...s.printer, shopName: s.shop.name }); },
    input(e) { this.setData({ [e.currentTarget.dataset.field]: e.detail.value }); },
    copies(e) { this.setData({ copies: Number(e.currentTarget.dataset.value) }); },
    toggle(e) { this.setData({ autoPrint: e.detail.value }); },
    async save() {
        try {
            const d = this.data;
            await (0, cloud_repository_2.savePrinter)({ name: d.name, serial: d.serial, copies: d.copies, autoPrint: d.autoPrint });
            wx.showToast({ title: '演示设置已保存' });
        }
        catch (e) {
            wx.showToast({ title: e.message, icon: 'none' });
        }
    },
    test() { this.setData({ testOpen: true }); },
    close() { this.setData({ testOpen: false }); },
    noop() { },
    orders() { wx.navigateTo({ url: '/pages/admin-orders/index' }); }
}));
