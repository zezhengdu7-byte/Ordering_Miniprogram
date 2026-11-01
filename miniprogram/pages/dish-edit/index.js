"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const cloud_repository_1 = require("../../utils/cloud-repository");
const auth_1 = require("../../utils/auth");
const cloud_repository_2 = require("../../utils/cloud-repository");
Page((0, auth_1.merchantPage)({
    data: { isNew: true, categories: [], categoryIndex: 0, name: '', price: '', unit: '串', description: '', image: '/assets/menu/lamb.jpg', tag: '', spicy: true, onSale: true, soldOut: false, dishId: '' },
    async onLoad(options) {
        await (0, cloud_repository_1.syncMerchant)();
        const s = (0, cloud_repository_2.read)();
        const dish = s.dishes.find(d => d.id === options.id);
        const categoryIndex = Math.max(0, s.categories.findIndex(c => c.id === ((dish === null || dish === void 0 ? void 0 : dish.categoryId) || options.categoryId)));
        this.setData({ categories: s.categories, categoryIndex });
        if (dish)
            this.setData({ ...dish, isNew: false, dishId: dish.id, price: (0, cloud_repository_2.money)(dish.price) });
        wx.setNavigationBarTitle({ title: dish ? '编辑菜品' : '添加菜品' });
    },
    input(e) { this.setData({ [e.currentTarget.dataset.field]: e.detail.value }); },
    toggle(e) { this.setData({ [e.currentTarget.dataset.field]: e.detail.value }); },
    category(e) { this.setData({ categoryIndex: Number(e.detail.value) }); },
    chooseImage() {
        wx.chooseMedia({ count: 1, mediaType: ['image'], sourceType: ['album', 'camera'], success: async (r) => {
                wx.saveFile({ tempFilePath: r.tempFiles[0].tempFilePath, success: (f) => { this.setData({ image: f.savedFilePath }); }, fail: () => wx.showToast({ title: '图片保存失败，请重试', icon: 'none' }) });
            } });
    },
    async save() {
        var _a;
        if (this.saving)
            return;
        const d = this.data;
        const priceText = String(d.price).trim();
        if (!/^\d{1,5}(\.\d{1,2})?$/.test(priceText)) {
            wx.showToast({ title: '价格最多两位小数', icon: 'none' });
            return;
        }
        this.saving = true;
        try {
            const dish = { id: d.dishId || `dish-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, categoryId: ((_a = d.categories[d.categoryIndex]) === null || _a === void 0 ? void 0 : _a.id) || '', name: d.name, price: Math.round(Number(priceText) * 100), unit: d.unit, description: d.description.trim(), image: d.image, tag: d.tag.trim(), spicy: d.spicy, onSale: d.onSale, soldOut: d.soldOut };
            await (0, cloud_repository_2.saveDish)(dish);
            wx.showToast({ title: '菜品已保存' });
            wx.navigateBack();
        }
        catch (e) {
            wx.showToast({ title: e.message, icon: 'none' });
        }
        finally {
            this.saving = false;
        }
    },
    delete() {
        wx.showModal({ title: '删除这道菜？', content: '会从菜单和当前购物车移除，历史订单保留。', confirmText: '删除', confirmColor: '#b74b32', success: async (r) => { if (r.confirm) {
                await (0, cloud_repository_2.deleteDish)(this.data.dishId);
                wx.navigateBack();
            } } });
    }
}));
