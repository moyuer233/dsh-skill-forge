# Skill Forge

左侧栏一个入口，点开是一个主区面板，用来管这台机器上的 skill：看、查、校验、新建。

![preview](docs/preview.svg)

## 装

还没发版，本地目录装：

```bash
# 1) 把插件目录放进 profile（或直接改 profile 的 package.json 加 file: 依赖）
# 2) 重启 DSH
```

装完在左侧栏底部会多一个图标，点开就是面板。

## 面板里有什么

| 区域 | 做什么 |
|---|---|
| 列表 | 当前工作区可见的全部 skill，显示名字 + 两行描述；搜索框按名字和描述过滤 |
| 概览 | 选中后的第一屏：来源目录、磁盘路径、行数与字节数、description、什么时候用 |
| SKILL.md | 原文，等宽字体，自动换行 |
| 校验 | 点一下跑格式检查，分错误与提醒两档 |
| 文件 | skill 目录下的文件与子目录 |
| 新建 | 填名字和 description，选一个用户级根目录，生成带注释的 SKILL.md 骨架 |

## 校验查什么

**错误**（会判为不合格）

- frontmatter 缺失、没闭合、或含无法解析的行
- `name` 缺失、不是 kebab-case、或与目录名不一致
- 未知的 frontmatter 字段
- `description` 缺失，或超过 1024 字符
- 正文超过 500 行，或少于 100 字符

**提醒**（不判不合格，但会影响触发）

- `description` 短于 30 字符
- `description` 里看不出「什么时候用」
- SKILL.md 里引用的 `references/`、`scripts/` 文件不存在

## 支持的平台

| 平台 | 状态 |
|---|---|
| DSH Web（本机 0.2.2-rc.3） | 已实测：面板渲染、四个 tab、搜索、新建弹窗、校验请求、错误态与空态，全部在 jsdom + 真实 React 18 里跑通 |
| DSH Desktop（Windows） | 未实测：代码与 Web 同一套，但桌面壳的槽挂载没在真机上验证过 |
| DSH CLI / headless | 不适用：面板是 Client 插件，headless 没有界面 |

## 已知限制

- 面板只读，不能编辑 skill。改了要落盘再让注册表重扫，这一版没做。
- 新建只写 `~/.dsh/skills` 与 `~/.agents/skills`，不写项目目录，不覆盖已存在目录。
- 没有磁盘目录的 skill（插件自带的），校验和文件两页会说明无法进行。
- 校验只查格式，不判断内容写得好不好。

## 自检

```bash
# 包结构 + 纯函数
node test/selftest.mjs

# Host 四条路由的接线（假 ctx + 临时目录）
node test/host.mjs

# Client 面板（要 react + react-dom + jsdom，见下）
SF_REACT_DIR=H:/1/_rtest/node_modules node test/client.mjs

# 一次跑完
SF_REACT_DIR=H:/1/_rtest/node_modules node test/run-all.mjs
```

Client 那套要 React 与 jsdom。测试依赖不装进插件：

```bash
mkdir -p H:/1/_rtest && cd H:/1/_rtest
npm install react@18.3.1 react-dom@18.3.1 jsdom
```

## 反馈

有 bug 或想加功能，开 issue 时带上：

- DSH 版本（`dsh --version`）
- 面板里看到的现象（截图最好）
- 控制台报错原文（F12 → Console）

## 协议

MIT。作者 [MoyuStarry](https://space.bilibili.com/514699365)。
