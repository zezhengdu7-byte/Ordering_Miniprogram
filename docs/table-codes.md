# 固定桌码

本地代码已实现；尚未验证 table-service 部署、真实微信生成和两机扫码。本文件不表示云端已生成30张图片。

## 产品约定

- 统一生成正式版小程序码，page 为 pages/menu/index。checkPath=false 允许发布前预先生成；普通顾客使用前仍须发布小程序。
- 商家页面提供“生成／补齐 A01–A30 桌码”。逐张生成并保存 codes.release 云存储 fileID；失败重试复用已有图片和令牌。
- 每张桌台仅首次生成二维码。后续查看、保存、批量补齐以及传入 reset 参数都不能更换有效码。页面不再提供重置入口。
- 新增桌台会保存桌台并生成正式码；生成失败仍保留桌台，可点“查看／生成桌码”重试。
- 桌码在列表显示，可预览、保存相册。删除桌台为 active=false，旧码失效；同名重建视为新桌台，生成新码。
- 结束用餐只关闭 session、清除桌台 currentSessionId；不修改 qrTokenHash、qrVersion 或 codes。下一次扫码创建新的 session/cart，旧 session 不能恢复权限。
- 商家可对任意桌台“停用桌码”或“启用桌码”（qrEnabled）。停用只阻止新的扫码入座，进行中的用餐与已绑定的会话继续有效；启用后原打印桌码立即可用，不更换令牌。

## 与统一云端接入的衔接

本聊天不操作另一聊天正在使用的开发者工具、部署和订单代码。table-service 兼容 provision 预置的 table-a01/table-a02/table-a06 ID，新增仍使用规范化桌名哈希作为ID，避免同名桌台重复。

schema 需要 tables、sessions、session_members、carts、orders，规则保持客户端 read=false/write=false。生成和商家操作逐次验证可信微信身份。

现有 table-service.close 对已存在任何云订单的会话保守拒绝关桌。统一接入订单后，必须由订单服务维护 session 中的结算约束，并在关桌事务内验证，不能继续依赖事务外订单查询来承诺并发安全。现阶段桌码测试不代表订单关桌已验收。

## 验证

- npm run build：通过。
- node --test tests/table-service.test.cjs：6项通过，新增停用/启用桌码（不换码、旧会话不受影响、非商家不可操作）。
- npm test：本次38项中37项通过；merchant-management 的商家取消测试未通过（统一订单接入进行中）。
- 未做真实云端并发和30张微信码验收。
