# 云端部署记录

部署日期：2026-11-01。环境：`cloud1-d0g5igvuk85096f8a`；小程序 AppID：`wx7dc3e02ff34b0133`；门店 ID：`charcoal-demo`。

## 已部署

- `identity`：根据可信微信上下文返回顾客、店主或员工身份。
- `provision`：店主专用的集合、安全规则、索引、初始菜单和图片导入入口。
- `restaurant`：菜单快照、商家菜单与设置修改、顾客下单、商家订单处理。
- `table-service`：固定桌码生成、扫码加入会话、会话校验、关桌。
- 13 个集合：`stores`、`store_members`、`categories`、`dishes`、`tables`、`sessions`、`session_members`、`carts`、`orders`、`payments`、`printers`、`print_jobs`、`catalog_meta`。
- 各集合默认安全规则为 `read=false`、`write=false`，索引按 [database/collections.json](../database/collections.json) 创建。
- 8 个菜单分区和 54 道菜。菜品图片存储在 `menu/v2/`，菜品文档保存对应云文件 ID。
- 初始桌台为 A01、A02、A06。桌台页可补齐 A01–A30 固定正式桌码。

## 验收检查

- `provision schema` 返回集合已存在或已创建、安全规则为拒绝直读写，并列出预期索引。
- `provision seedBase` 返回 8 个分区、3 张桌台。
- `provision seedImages` 可重复执行，已有菜品跳过；正式验收已返回菜品 54、图片 54、图片云文件全部有效，肉类前四项顺序为羊肉、牛肉、猪肉、带皮五花肉。
- A01–A30 共 30 张固定正式版桌码已生成并保存。
- 本地 `npm test` 覆盖身份、菜单、价格、订单状态、会话隔离、桌码、餐具费用、重复提交和关桌约束。
- 微信开发者工具编译错误数为 0；开发版 `1.0.0` 已上传，备注为“云端菜单、桌码、订单同步，餐具及餐巾纸计费”。上线体验版仍需管理员在小程序管理后台把这次代码设为体验版本。

## 未接入

- 微信支付、退款、真实结算流水。
- 飞鹅等硬件云打印及打印任务派发。
- 购物车跨设备共享加购、多人分账、会员和营销。
- 生产级监控告警、告警值班、备份保留策略和两台真实手机并发验收。
