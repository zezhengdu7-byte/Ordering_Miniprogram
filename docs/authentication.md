# 微信门店身份验证

当前已实现身份验证与未配置环境的锁定行为，identity 已部署到测试小程序的微信云环境，并完成开发工具中的顾客身份校验与店主入口验收。菜品和订单仍为本机 Demo 数据；本次没有把业务数据迁移到云端，不应据此直接上线营业。

## 你需要完成的账号步骤

1. 本人在微信公众平台 https://mp.weixin.qq.com/ 注册小程序，按实际经营主体填写资料；主体认证和支付商户申请按平台要求由本人完成。开发代码无需先申请微信支付。
2. 取得小程序 AppID（公开标识）。在微信开发者工具中使用自己的微信登录并关联小程序；游客 AppID 无法完成正式身份验证。
3. 开通/关联微信云开发环境，取得环境 ID。根据页面当时显示的套餐和价格决定是否开通付费服务，不需要为了先看界面马上购买。

AppID 和环境 ID 可交给开发者配置，不要提供 AppSecret、微信密码或支付密钥。

## 配置与部署

1. 修改根目录 `project.config.json` 的 `appid` 为真实 AppID。
2. 修改 `miniprogram/config.ts` 的 `envId`，`storeId` 设置为稳定门店标识，然后编译 TypeScript。云函数使用 `wx-server-sdk` + 微信云开发调用链，不混用独立 CloudBase 的自定义 ticket 登录。
3. 在匹配该 AppID 的云环境中创建 `stores` 和 `store_members` 集合。对两个集合分别配置安全规则 `{"read":false,"write":false}`，禁止小程序直接读写。`cloudfunctions/database.rules.json` 是需手动配置的规则清单，不会随云函数自动部署。
4. 在 `stores` 集合通过云控制台创建：`{"storeId":"charcoal-demo","appId":"你的真实AppID","active":true}`。storeId 与前端配置保持一致。为 stores 建立 storeId+appId+active 索引，为 store_members 建立 storeId+appId+openid+active 索引。
5. 开发者工具中对 `cloudfunctions/identity` 选择“上传并部署：云端安装依赖”。只部署到自己确认的环境。
6. 运行小程序，长按顾客菜单的“炭火里 · 烧烤”店名，进入身份验证页，点击验证。尚未授权时会显示当前微信标识（自己的 OPENID），可选择复制给店主。
7. 首位店主由有云控制台权限的人手动添加 store_members 文档：`{"storeId":"charcoal-demo","appId":"你的真实AppID","openid":"验证页显示的微信标识","role":"owner","active":true}`。后续员工使用 `role:"staff"`。不得开放顾客自行指定角色或自行成为首位店主的接口。
8. 再次验证即可进入管理页；返回点餐后，只有校验通过的人显示“门店管理”按钮。普通顾客只看到点餐、订单，无商家 tab。员工入口通过长按店名进入，入口位置不承担安全职责。

## 校验机制与边界

- 身份来自云函数 `cloud.getWXContext()` 中的 OPENID/APPID；请求中的 openid/role 不参与鉴权。
- 门店必须启用并匹配当前 AppID；员工必须同时匹配门店、AppID、OPENID、启用状态，只有 owner/staff 可管理。
- 页面加载、重新显示和操作前会重新请求身份，不从 localStorage 缓存角色。网络失败、环境未配、权限撤销均拒绝管理；不会自动降级成演示店主。
- 停用员工：将该成员的 active 设为 false。后续校验立即拒绝；已显示的页面不主动实时监听撤权，在下次操作/重新进入时生效。
- 页面守卫保护界面交互，不能保护本地存储免受设备使用者修改。本机 Demo 中的商家操作不写入云数据库。
- 后续迁移菜单、订单、打印到云端时，每个云函数必须在读写前使用 `requireMerchant`（`cloudfunctions/identity/access.js`），从可信上下文校验当前门店。不能相信前端“已经验证”的标记；顾客订单也需校验订单归属和用餐会话。
- stores/store_members 只能由授权控制台人员维护。当前没有员工自助邀请、手机号登录或会员系统。

## 必做的真实环境验收

用店主、普通顾客两个微信分别验证：顾客没有管理入口、直接打开管理页被拒绝；店主可以进入；停用成员后下一次操作被拒绝；网络失败不能进入。再验证不同 storeId/AppID 的权限互不串用。当前本地自动测试覆盖这些校验逻辑，不能替代真实微信环境验收。

依据：
- [腾讯官方：小程序调用云函数与可信微信上下文](https://docs.cloudbase.net/recipes/add-cloud-function-wechat-miniprogram)
- [腾讯官方：数据库安全规则](https://docs.cloudbase.net/rule/learn-rules)

## 当前测试号接入进度

当前测试小程序 AppID 为 `wx7dc3e02ff34b0133`，实际使用已关联的微信云开发环境 `cloud1-d0g5igvuk85096f8a`。另一个腾讯云账号下的 `indirect-duck-d4g8lxxsg0d37003a` 未导入、未部署，本项目不再使用该环境。

2026-10-30 已通过微信开发工具完成：
- 创建 `stores` 和 `store_members`，创建时选择“所有用户不可读写”。
- 创建测试门店记录，storeId 为 `charcoal-demo`，appId 与测试小程序一致，active 为 true。
- 将 `identity` 部署到 cloud1，选择云端安装依赖。
- 从模拟器身份页成功调用云函数，显示当前微信标识及“尚未绑定员工权限”，验证普通顾客身份与拒绝管理行为。
- TypeScript 编译及 19 项本地测试通过。

2026-10-31 用户确认将当前开发工具微信设为测试店主后，已保存 store_members 的 owner 授权记录（active 为 true），并从云控制台读回确认。重新打开项目后，顾客菜单显示“门店管理”，点击后通过云端身份校验进入“商家工作台”，完成当前微信的店主入口验收。菜品、分区、订单及门店设置入口已显示。

云控制台显示开发期免费，按量付费与自动续费关闭；本次未购买套餐、未修改计费开关。真实支付、多人共享订单和云端业务 CRUD 仍未接入。两台真实微信的权限验收、撤权验收仍待完成。

账号冲突原因：用户截图确认小程序原绑定账号与另行注册腾讯云账号不同。本次直接使用开发工具中已登录并关联的小程序环境，未进行解绑、换绑或删除环境。

参考：[腾讯云账号相关问题](https://cloud.tencent.cn/document/product/876/57380)。

## 开发工具本地预览

未配置云环境时，开发工具的 develop 版本身份页提供显式的“查看商家本地演示”。预览状态仅在内存中保存，不赋予 owner/staff 身份，不调用云端业务；真机、体验版、正式版和已配置云环境均不提供该入口。返回顾客点餐会退出预览，真实认证失败不会自动进入预览。
