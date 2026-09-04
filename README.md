# 嗨！搓麻呀！ (play-mahjong)

一套自约定玩法的麻将游戏。暂无地区名称，规则由牌友口约定稿，本仓库为其数字实现。

## 玩法速览

- **120 张牌**：万 / 筒 / 条各 36 张，红中、发财、白板各 4 张；无风牌、无花牌
- **发财是宝牌**：摸到即亮出，从墙尾补一张；每张 +1 番，不能碰、不能杠、不入牌型
- **禁吃**，三家通碰，无抢杠胡
- **3 番种可叠加**：碰碰胡 +1、清一色 +1、发财每张 +1
- **报嘴**（固定听口）：≥3 财听牌可自愿报嘴锁定听口，换来自摸、点炮全解锁
- 荒庄杠分一律作废（含已付的补杠分）

完整规则见 [自定义麻将规则.md](./自定义麻将规则.md)。

## 项目结构

```
├── 自定义麻将规则.md    # 规则定稿（实现最高依据）
├── src/                # TypeScript 规则引擎
│   ├── tiles.ts        # 120 张牌定义
│   ├── wall.ts         # 双向牌墙（正向摸牌 / 墙尾补牌）
│   ├── rules.ts        # 胡牌、听牌、番种、报嘴判定
│   ├── game.ts         # 回合状态机与结算
│   └── ...
├── src/*.test.ts       # vitest 单元测试
├── web/                # React + Vite 牌桌 UI
├── server/             # HTTP + WebSocket 权威服务
└── local-docs/         # 需求分析、实施计划和进度台账
```

详细实施步骤和当前进度见 [local-docs/开发实施计划.md](./local-docs/开发实施计划.md)。
生产运行、Docker、备份和回滚见 [DEPLOYMENT.md](./DEPLOYMENT.md)。

## 开发

```bash
npm install        # 安装依赖
npm run dev        # 启动本地牌桌页面
npm run check      # TypeScript 类型检查
npm test           # 运行全部测试
npm run coverage   # 测试并生成覆盖率报告
npm run quality    # 运行提交/CI 前全部质量门禁
npm run build      # 编译引擎、页面和 WebSocket 服务
npm start          # 启动页面和 WebSocket 服务（默认 8787）
```

## 状态

- [x] M1 规则引擎 + 单元测试
- [x] M2 本地对战 UI（可玩、可存档、可回放）
- [x] M3 AI 对手（三档可解释策略）
- [x] M4 多局与联网（权威房间、重连、观战、WebSocket）
- [~] M5 发布质量（质量与兼容性完成，发布准备进行中）
