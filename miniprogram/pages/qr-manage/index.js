"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const auth_1 = require("../../utils/auth");
const table_service_1 = require("../../utils/table-service");
Page((0, auth_1.merchantPage)({
    data: { tables: [], name: '', editorOpen: false, detail: null, error: '', busy: false, version: 'release', progress: '' },
    async onShow() { await this.refresh(); },
    async refresh() {
        try {
            const r = await (0, table_service_1.tableCall)('list');
            this.setData({ tables: r.tables, error: '' });
        }
        catch (e) {
            this.setData({ tables: [], error: e.message });
        }
    },
    async batchGenerate() {
        if (this.data.busy)
            return;
        this.setData({ busy: true, progress: '正在准备云端桌台…' });
        const failed = [];
        try {
            for (let i = 1; i <= 30; i++) {
                const name = 'A' + String(i).padStart(2, '0');
                this.setData({ progress: `正在生成 ${name}（${i}/30）` });
                try {
                    try {
                        await (0, table_service_1.tableCall)('add', { name });
                    }
                    catch (e) {
                        if (e.message !== '桌号已存在')
                            throw e;
                    }
                    const list = await (0, table_service_1.tableCall)('list');
                    const table = list.tables.find((t) => t.name.toUpperCase() === name);
                    if (!table)
                        throw new Error('未找到桌台');
                    await (0, table_service_1.tableCall)('code', { tableId: table.id, version: 'release' });
                }
                catch (e) {
                    failed.push(name);
                    this.setData({ error: e.message });
                    if (i === 1)
                        throw e;
                }
            }
            this.setData({ progress: failed.length ? `已完成，${failed.join('、')}未生成，点击批量生成可补齐。` : 'A01–A30 正式版桌码已全部保存。' });
            await this.refresh();
        }
        catch (e) {
            this.setData({ progress: '生成未完成，重试会保留已生成桌码。', error: e.message });
        }
        finally {
            this.setData({ busy: false });
        }
    },
    add() { this.setData({ name: '', editorOpen: true }); },
    input(e) { this.setData({ name: e.detail.value }); },
    close() { this.setData({ editorOpen: false, detail: null }); },
    noop() { },
    async save() {
        if (this.data.busy)
            return;
        this.setData({ busy: true });
        try {
            const name = this.data.name.trim().normalize('NFKC').toUpperCase();
            await (0, table_service_1.tableCall)('add', { name });
            this.close();
            await this.refresh();
            const table = this.data.tables.find((t) => t.name === name);
            if (table) {
                await (0, table_service_1.tableCall)('code', { tableId: table.id, version: 'release' });
                await this.refresh();
            }
        }
        catch (e) {
            wx.showToast({ title: e.message, icon: 'none' });
        }
        finally {
            this.setData({ busy: false });
        }
    },
    confirmAction(e) {
        const { id, action } = e.currentTarget.dataset;
        const close = action === 'close';
        wx.showModal({ title: close ? '结束本次用餐？' : '删除桌台？', content: close ? '结束后当前顾客权限失效，下次扫码会创建新一次用餐。' : '旧桌码将失效；进行中的用餐必须先结束。', success: async (r) => {
                if (!r.confirm)
                    return;
                try {
                    await (0, table_service_1.tableCall)(action, { tableId: id });
                    await this.refresh();
                }
                catch (e) {
                    wx.showToast({ title: e.message, icon: 'none' });
                }
            } });
    },
    toggleCode(e) {
        const id = e.currentTarget.dataset.id;
        const table = this.data.tables.find((t) => t.id === id);
        const enabling = !table.qrEnabled;
        wx.showModal({ title: enabling ? '启用桌码？' : '停用桌码？', content: enabling ? '顾客可重新扫描此桌码入座点单。' : '停用后顾客扫此桌码将无法入座；进行中的用餐不受影响。', success: async (r) => {
                if (!r.confirm)
                    return;
                try {
                    await (0, table_service_1.tableCall)('setQrEnabled', { tableId: id, enabled: enabling });
                    await this.refresh();
                }
                catch (e) {
                    wx.showToast({ title: e.message, icon: 'none' });
                }
            } });
    },
    code(e) { void this.generate(e.currentTarget.dataset.id); },
    async generate(id) {
        if (this.data.busy)
            return;
        this.setData({ busy: true });
        wx.showLoading({ title: '正在生成桌码', mask: true });
        try {
            const r = await (0, table_service_1.tableCall)('code', { tableId: id, version: 'release' });
            const download = await wx.cloud.downloadFile({ fileID: r.fileID });
            const table = this.data.tables.find((t) => t.id === id);
            this.setData({ detail: { id, name: table === null || table === void 0 ? void 0 : table.name, path: download.tempFilePath } });
            await this.refresh();
        }
        catch (e) {
            wx.showModal({ title: '桌码生成失败', content: e.message, showCancel: false });
        }
        finally {
            wx.hideLoading();
            this.setData({ busy: false });
        }
    },
    saveImage() {
        wx.saveImageToPhotosAlbum({ filePath: this.data.detail.path, success: () => wx.showToast({ title: '已保存，可打印' }), fail: () => wx.showModal({ title: '保存未完成', content: '请允许保存到相册后重试，也可以点击桌码预览后长按保存。', showCancel: false }) });
    },
    preview() { wx.previewImage({ urls: [this.data.detail.path] }); }
}));
