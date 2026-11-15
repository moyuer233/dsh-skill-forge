#!/usr/bin/env node
// Client 半边自检：在 jsdom 里用真实 React 18 挂载 lib/client.js 注册的面板，
// 跑真实 effect、真实点击，验证加载态 → 数据态 → 选中 → 校验 → 新建弹窗。
//
// 测试依赖（不是插件依赖）：
//   cd H:/1/_rtest && pnpm add react@18.3.1 react-dom@18.3.1 jsdom
// 然后 SF_REACT_DIR=H:/1/_rtest/node_modules
//
// 跑法: SF_REACT_DIR=H:/1/_rtest/node_modules node test/client.mjs

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DEPS = process.env.SF_REACT_DIR ?? 'H:/1/_rtest/node_modules'

let failures = 0
function check(label, condition, detail) {
  if (condition) console.log(`  ok   ${label}`)
  else { failures += 1; console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`) }
}

// ------------------------------------------------------------ jsdom 环境

const depRequire = createRequire(join(DEPS, 'noop.js'))
const { JSDOM } = depRequire('jsdom')
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
})

globalThis.window = dom.window
globalThis.document = dom.window.document
// Node 24 的 globalThis.navigator 是只读 getter，用 defineProperty 覆盖。
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })
globalThis.HTMLElement = dom.window.HTMLElement
globalThis.Node = dom.window.Node
globalThis.MouseEvent = dom.window.MouseEvent
globalThis.KeyboardEvent = dom.window.KeyboardEvent
globalThis.Event = dom.window.Event
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window)
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window)

const React = depRequire('react')
const ReactDOM = depRequire('react-dom/client')
const { act } = depRequire('react-dom/test-utils')

// React 18 需要显式声明这是 act 环境，否则 effect 不会同步刷
globalThis.IS_REACT_ACT_ENVIRONMENT = true

// ------------------------------------------------------------ 假模块加载器

let loaded = null
window.__ModuleLoader__ = { load(definition) { loaded = definition } }

const fakeRequire = (id) => {
  if (id === 'react') return React
  throw new Error(`unexpected require: ${id}`)
}

// ------------------------------------------------------------ 假宿主 ctx

const registered = []
const dictionaries = new Map()
const localeListeners = new Set()
let localeRevision = 1

const localeService = {
  register(namespace, dictionary) {
    dictionaries.set(namespace, dictionary)
    return () => dictionaries.delete(namespace)
  },
  bind(namespace) {
    return (key, params) => {
      const table = dictionaries.get(namespace)?.zh ?? {}
      const template = table[key] ?? key
      if (!params) return template
      return template.replace(/\{(\w+)\}/g, (whole, name) => (name in params ? String(params[name]) : whole))
    }
  },
  subscribe(listener) {
    localeListeners.add(listener)
    return () => localeListeners.delete(listener)
  },
  getSnapshot() {
    return { active: 'zh', revision: localeRevision }
  },
}

const slotsService = {
  inject(slot, factory) { factory(); return { slot } },
  register(options, component) { registered.push({ options, component }); return () => {} },
}

const ctx = {
  locale: localeService,
  slots: slotsService,
  effect(factory) { return factory() },
  get(key) {
    if (key === 'locale') return localeService
    if (key === 'slots') return slotsService
    return undefined
  },
}

// ------------------------------------------------------------ 加载并 apply

console.log('\n模块注册')
const source = readFileSync(join(ROOT, 'lib/client.js'), 'utf8')
new Function('window', 'require', source)(window, fakeRequire)
check('调用了 __ModuleLoader__.load', loaded !== null)
check('id 是 dsh-skill-forge', loaded?.id === 'dsh-skill-forge', loaded?.id)

const module_ = loaded.factory(fakeRequire)
check('inject 含 slots 与 locale', module_.inject?.includes('slots') && module_.inject?.includes('locale'), JSON.stringify(module_.inject))
// 少了 name，槽注册会归到宿主默认 fiber（inspect 里 registrant 显示成 WC 而不是包名）。
check('导出了 name（槽归属靠它）', module_.name === 'dsh-skill-forge', String(module_.name))
module_.apply(ctx)

console.log('\n槽注册')
const mainEntry = registered.find((entry) => entry.options.name === 'main')
const panelEntry = registered.find((entry) => entry.options.name === 'sidebar.panellist')
check('注册了 main', mainEntry !== undefined)
check('main 的 key 是 skill-forge', mainEntry?.options.key === 'skill-forge', mainEntry?.options.key)
check('注册了 sidebar.panellist', panelEntry !== undefined)
check('panellist 的 id 与 main 的 key 一致', panelEntry?.options.id === mainEntry?.options.key, panelEntry?.options.id)
check('panellist 带 order', typeof panelEntry?.options.order === 'number', String(panelEntry?.options.order))
check('panellist 带 label 函数', typeof panelEntry?.options.label === 'function')
check('两个槽都带 locale 命名空间', mainEntry?.options.locale === 'skill-forge' && panelEntry?.options.locale === 'skill-forge')

console.log('\n字典')
const dictionary = dictionaries.get('skill-forge')
check('注册了 zh/en 两套字典', Boolean(dictionary?.zh && dictionary?.en))
check('中英 key 集合一致', JSON.stringify(Object.keys(dictionary.zh).sort()) === JSON.stringify(Object.keys(dictionary.en).sort()),
  JSON.stringify(Object.keys(dictionary.zh).filter((key) => !(key in dictionary.en))))
check('label 返回中文标题', panelEntry.options.label() === '技能工坊', panelEntry.options.label())

// ------------------------------------------------------------ 渲染夹具

const SKILLS_OK = {
  ok: true,
  value: {
    skills: [
      { name: 'agent-code-work', description: '写代码与改产物的纪律。凡是要写/改代码时使用。', sourceLabel: '~/.dsh/skills', source: 'user-dsh', lines: 120, bytes: 5200 },
      { name: 'playwright-cli', description: 'Automate browser interactions, test web pages.', sourceLabel: '~/.agents/skills', source: 'user-agents', lines: 80, bytes: 3100 },
    ],
  },
}

const DETAIL_OK = {
  ok: true,
  value: {
    name: 'agent-code-work',
    description: '写代码与改产物的纪律。',
    whenToUse: '当用户要写代码时',
    sourceLabel: '~/.dsh/skills',
    path: 'C:/Users/x/.dsh/skills/agent-code-work',
    raw: '---\nname: agent-code-work\ndescription: 写代码与改产物的纪律\n---\n\n# 正文\n',
    content: '# 正文',
    lines: 120,
    bytes: 5200,
    entries: [{ name: 'references', dir: true }, { name: 'SKILL.md', dir: false }],
  },
}

const VALIDATE_BAD = {
  ok: true,
  value: { ok: false, errors: ['frontmatter 缺 name'], warnings: ['description 太短'], missing: [], path: 'x', lines: 12, bytes: 200 },
}

const SCAFFOLD_OK = { ok: true, value: { path: 'C:/Users/x/.dsh/skills/new-skill', file: 'x', lines: 20, bytes: 400 } }

function mockFetch(routes) {
  const calls = []
  const impl = async (path, init) => {
    calls.push({ path, body: JSON.parse(init?.body ?? '{}') })
    const handler = routes[path]
    if (!handler) throw new Error(`unexpected fetch: ${path}`)
    return { json: async () => handler(JSON.parse(init?.body ?? '{}')) }
  }
  impl.calls = calls
  return impl
}

/** 挂载面板，跑完首轮 effect 与随之而来的异步请求。每次都用全新的容器。 */
async function mountPanel(routes) {
  const fetchImpl = mockFetch(routes)
  globalThis.fetch = fetchImpl
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = ReactDOM.createRoot(host)
  const Panel = mainEntry.component
  await act(async () => { root.render(React.createElement(Panel)) })
  // 让 fetch 的 promise 链落定，再跑一轮 effect
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 40)) })
  return { host, root, fetch: fetchImpl, html: () => host.innerHTML, dispose: async () => { await act(async () => { root.unmount() }); host.remove() } }
}

const allRoutes = {
  'api/skill-forge/list': () => SKILLS_OK,
  'api/skill-forge/read': () => DETAIL_OK,
  'api/skill-forge/validate': () => VALIDATE_BAD,
  'api/skill-forge/scaffold': () => SCAFFOLD_OK,
}

console.log('\n挂载：加载态 → 数据态')
const panel = await mountPanel(allRoutes)
const html = panel.html()
check('页面骨架渲染出来了', html.includes('sf-page'))
check('标题是技能工坊', html.includes('技能工坊'))
check('list 请求发出', panel.fetch.calls.some((call) => call.path === 'api/skill-forge/list'),
  JSON.stringify(panel.fetch.calls.map((call) => call.path)))
check('列出了第一个 skill', html.includes('agent-code-work'), html.slice(0, 300))
check('列出了第二个 skill', html.includes('playwright-cli'))
check('显示数量 2 个技能', html.includes('2 个技能'), /sf-count[^>]*>([^<]*)</.exec(html)?.[1])
check('不再显示加载态', !html.includes('读取中'))
check('空选中时给提示', html.includes('从左边选一个技能'))
check('搜索框有 aria-label', html.includes('aria-label="搜索名字或描述"'))
check('列表有 role=listbox', html.includes('role="listbox"'))
check('行按钮带 aria-selected', /class="sf-row"[^>]*aria-selected="false"/.test(html))
check('渲染了内联 SVG', html.includes('<svg'))

console.log('\n点击：选中一个 skill')
{
  const rows = [...panel.host.querySelectorAll('.sf-row')]
  check('找到两个行按钮', rows.length === 2, String(rows.length))
  const target = rows.find((row) => row.textContent.includes('agent-code-work'))
  check('找到 agent-code-work 那一行', Boolean(target))
  await act(async () => { target.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 40)) })
  const after = panel.html()
  check('发出 read 请求', panel.fetch.calls.some((call) => call.path === 'api/skill-forge/read' && call.body.name === 'agent-code-work'),
    JSON.stringify(panel.fetch.calls.map((call) => `${call.path}:${JSON.stringify(call.body)}`)))
  check('行按钮变成选中态', /class="sf-row"[^>]*aria-selected="true"/.test(after))
  check('详情标题显示', after.includes('agent-code-work'))
  check('出现 tab 行', after.includes('role="tablist"'))
  check('tab 有四个', [...panel.host.querySelectorAll('[role="tab"]')].length === 4,
    String([...panel.host.querySelectorAll('[role="tab"]')].length))
  check('概览显示目录路径', after.includes('.dsh/skills/agent-code-work'))
  check('概览显示行数', after.includes('120 行'), /sf-dl[\s\S]{0,600}/.exec(after)?.[0]?.slice(0, 200))

  console.log('\n点击：切到 SKILL.md')
  const sourceTab = [...panel.host.querySelectorAll('[role="tab"]')].find((tab) => tab.textContent === 'SKILL.md')
  check('找到 SKILL.md tab', Boolean(sourceTab))
  await act(async () => { sourceTab.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
  const sourceHtml = panel.html()
  check('显示 SKILL.md 原文', sourceHtml.includes('name: agent-code-work'))
  check('原文用 pre 包着', sourceHtml.includes('<pre class="sf-code"'))

  console.log('\n点击：切到校验并跑一遍')
  const validateTab = [...panel.host.querySelectorAll('[role="tab"]')].find((tab) => tab.textContent === '校验')
  await act(async () => { validateTab.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
  const idleHtml = panel.html()
  check('校验页初始给提示', idleHtml.includes('还没跑'), idleHtml.slice(-400))

  const runButton = [...panel.host.querySelectorAll('button')].find((button) => button.textContent.includes('跑校验'))
  check('找到跑校验按钮', Boolean(runButton))
  await act(async () => { runButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 40)) })
  const validated = panel.html()
  check('发出 validate 请求', panel.fetch.calls.some((call) => call.path === 'api/skill-forge/validate' && call.body.path === DETAIL_OK.value.path),
    JSON.stringify(panel.fetch.calls.filter((call) => call.path.includes('validate')).map((call) => call.body)))
  check('显示错误条数', validated.includes('有 1 个错误'), validated.slice(-500))
  check('列出错误内容', validated.includes('frontmatter 缺 name'))
  check('列出提醒内容', validated.includes('description 太短'))

  console.log('\n点击：切到文件')
  const filesTab = [...panel.host.querySelectorAll('[role="tab"]')].find((tab) => tab.textContent === '文件')
  await act(async () => { filesTab.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
  const filesHtml = panel.html()
  check('列出目录项', filesHtml.includes('references/') && filesHtml.includes('SKILL.md'), filesHtml.slice(-400))
}

console.log('\n交互：搜索过滤')
{
  const input = panel.host.querySelector('input[type="search"]')
  check('找到搜索框', Boolean(input))
  const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  await act(async () => {
    setValue.call(input, 'playwright')
    input.dispatchEvent(new window.Event('input', { bubbles: true }))
  })
  const rowNames = [...panel.host.querySelectorAll('.sf-row-name > span:first-child')].map((node) => node.textContent)
  check('只留下匹配项', rowNames.length === 1 && rowNames[0] === 'playwright-cli', JSON.stringify(rowNames))
  check('数量跟着变', panel.html().includes('1 个技能'))

  await act(async () => {
    setValue.call(input, 'zzz-nothing')
    input.dispatchEvent(new window.Event('input', { bubbles: true }))
  })
  check('无匹配时给空态', panel.html().includes('没有匹配的技能'))
}

console.log('\n交互：新建弹窗')
{
  await act(async () => {
    const input = panel.host.querySelector('input[type="search"]')
    const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setValue.call(input, '')
    input.dispatchEvent(new window.Event('input', { bubbles: true }))
  })
  const newButton = [...panel.host.querySelectorAll('button')].find((button) => button.textContent.includes('新建 skill'))
  check('找到新建按钮', Boolean(newButton))
  await act(async () => { newButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
  const dialogHtml = panel.html()
  check('弹窗渲染出来', dialogHtml.includes('class="sf-dialog"'), dialogHtml.slice(-500))
  check('弹窗有 role=dialog', dialogHtml.includes('role="dialog"'))
  check('弹窗有 aria-modal', dialogHtml.includes('aria-modal="true"'))
  check('有名字输入框', Boolean(panel.host.querySelector('#sf-new-name')))
  check('有 description 输入框', Boolean(panel.host.querySelector('#sf-new-desc')))
  check('有根目录下拉', Boolean(panel.host.querySelector('#sf-new-root')))
  check('提交按钮在没填内容时禁用', [...panel.host.querySelectorAll('.sf-dialog button')].some((button) => button.textContent === '创建' && button.disabled))

  const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  await act(async () => {
    const nameInput = panel.host.querySelector('#sf-new-name')
    setValue.call(nameInput, 'my-new-skill')
    nameInput.dispatchEvent(new window.Event('input', { bubbles: true }))
    const descInput = panel.host.querySelector('#sf-new-desc')
    setValue.call(descInput, '当用户想试一下新建流程时使用')
    descInput.dispatchEvent(new window.Event('input', { bubbles: true }))
  })
  const createButton = [...panel.host.querySelectorAll('.sf-dialog button')].find((button) => button.textContent === '创建')
  check('填完内容后按钮可用', createButton && !createButton.disabled)
  await act(async () => { createButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 40)) })
  check('发出 scaffold 请求', panel.fetch.calls.some((call) => call.path === 'api/skill-forge/scaffold' && call.body.name === 'my-new-skill'),
    JSON.stringify(panel.fetch.calls.filter((call) => call.path.includes('scaffold')).map((call) => call.body)))
  check('创建后弹窗关闭', !panel.html().includes('class="sf-dialog"'))
  check('创建后给成功提示', panel.html().includes('已创建'), panel.html().slice(-400))

  console.log('\nEscape 关弹窗')
  const newButton2 = [...panel.host.querySelectorAll('button')].find((button) => button.textContent.includes('新建 skill'))
  await act(async () => { newButton2.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
  check('弹窗又打开', panel.html().includes('class="sf-dialog"'))
  await act(async () => {
    window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  })
  check('Escape 关掉弹窗', !panel.html().includes('class="sf-dialog"'))
}

console.log('\n错误态')
{
  const brokenPanel = await mountPanel({
    'api/skill-forge/list': () => ({ ok: false, error: { code: 'x', message: '磁盘不可读' } }),
  })
  const brokenHtml = brokenPanel.html()
  check('显示错误文案', brokenHtml.includes('磁盘不可读'), brokenHtml.slice(0, 400))
  check('给重试按钮', brokenHtml.includes('重试'))
  check('不再显示加载态', !brokenHtml.includes('读取中'))
  await brokenPanel.dispose()
}

console.log('\n空态')
{
  const emptyPanel = await mountPanel({ 'api/skill-forge/list': () => ({ ok: true, value: { skills: [] } }) })
  const emptyHtml = emptyPanel.html()
  check('空列表给空态文案', emptyHtml.includes('没有匹配的技能'), emptyHtml.slice(0, 400))
  check('数量显示 0', emptyHtml.includes('0 个技能'))
  await emptyPanel.dispose()
}

console.log('\n样式约束')
{
  const styleBlock = [...panel.host.querySelectorAll('style')].map((node) => node.textContent).join('\n')
  check('样式里有主题 token', styleBlock.includes('--dsw-alias-'), styleBlock.length ? styleBlock.slice(0, 200) : '没有 style 节点')
  check('没有硬编码 hex 颜色（阴影除外）', !/#[0-9a-fA-F]{3,6}/.test(styleBlock.replace(/#000[0-9a-fA-F]{0,3}/g, '')),
    (styleBlock.match(/#[0-9a-fA-F]{3,6}/g) ?? []).slice(0, 6).join(','))
  check('用 0.5px 细边框', styleBlock.includes('.5px solid'), styleBlock.slice(0, 200))
  check('没有小于 12px 的字号', !/font-size:\s*(?:[0-9]|1[01])px/.test(styleBlock),
    (styleBlock.match(/font-size:\s*[^;}]+/g) ?? []).join(' | ').slice(0, 200))
  check('没有用中点做分隔符', !styleBlock.includes('·'))
}

console.log('\n图标组件')
{
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = ReactDOM.createRoot(host)
  await act(async () => { root.render(React.createElement(panelEntry.component, { size: 20, active: false })) })
  check('panellist 图标能单独渲染', host.innerHTML.includes('<svg'))
  check('图标尺寸跟随 size', host.innerHTML.includes('width="20"'), host.innerHTML.slice(0, 150))
  await act(async () => { root.unmount() })
  host.remove()
}

console.log('\n清理')
await panel.dispose()
check('卸载不抛错', true)

console.log('')
if (failures === 0) {
  console.log('全部通过')
  process.exitCode = 0
} else {
  console.log(`${failures} 项失败`)
  process.exitCode = 1
}
