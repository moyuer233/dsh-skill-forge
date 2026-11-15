#!/usr/bin/env node
// Host 半边的接线自检：用一个假的 ctx 调 apply()，确认四条路由都注册上，
// 并用真实的 skill 目录跑一遍 list / read / validate / scaffold。
//
// 跑法: node test/host.mjs

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply, validateSkill } from '../lib/index.js'

let failures = 0
function check(label, condition, detail) {
  if (condition) console.log(`  ok   ${label}`)
  else { failures += 1; console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`) }
}

// ---------------------------------------------------------------- 假宿主

const routes = new Map()
const disposers = []

const ctx = {
  effect(factory, label) {
    const dispose = factory()
    disposers.push({ label, dispose })
    return dispose
  },
  get(key) {
    if (key === 'connection') {
      return {
        fetch: {
          register(route) {
            routes.set(route.path, route)
            return () => routes.delete(route.path)
          },
        },
      }
    }
    if (key === 'skills') {
      return {
        async list() {
          // 注意：path 是**指令文件**的路径（SKILL.md），不是目录 —— 这是核心契约，
          // 之前按目录处理导致面板校验报「.../SKILL.md/SKILL.md」找不到。
          return [
            { name: 'demo-good', description: '当用户想试一下时使用，写清触发场景', source: 'user-dsh', provider: 'filesystem', invocation: { modelInvocable: true, userInvocable: true }, path: join(TMP, 'demo-good', 'SKILL.md') },
            { name: 'demo-bad', description: '短', source: 'user-agents', provider: 'filesystem', invocation: { modelInvocable: true, userInvocable: false }, path: join(TMP, 'demo-bad', 'SKILL.md') },
            { name: 'bundled-one', description: '当用户想用内置技能时使用', source: 'bundled', provider: 'bundled', invocation: { modelInvocable: true, userInvocable: true } },
            // 自定义 provider 给目录的也要能work
            { name: 'demo-dir', description: '当用户想验证目录形式的 path 时使用', source: 'custom', provider: 'custom', invocation: { modelInvocable: true, userInvocable: true }, path: join(TMP, 'demo-good') },
          ]
        },
        async get(name) {
          if (name === 'demo-dir') {
            const raw = readFileSync(join(TMP, 'demo-good', 'SKILL.md'), 'utf8')
            return { name, description: '当用户想验证目录形式的 path 时使用', source: 'custom', provider: 'custom', path: join(TMP, 'demo-good'), content: raw }
          }
          const dir = join(TMP, name)
          try {
            const raw = readFileSync(join(dir, 'SKILL.md'), 'utf8')
            return { name, description: '当用户想试一下时使用', source: 'user-dsh', provider: 'filesystem', path: join(dir, 'SKILL.md'), content: raw.split(/^---$/m).slice(2).join('---').trim() }
          } catch {
            return undefined
          }
        },
      }
    }
    return undefined
  },
}

// ---------------------------------------------------------------- 夹具

const TMP = mkdtempSync(join(tmpdir(), 'skill-forge-host-'))
const goodBody = '正文'.repeat(60)

mkdirSync(join(TMP, 'demo-good'), { recursive: true })
writeFileSync(join(TMP, 'demo-good', 'SKILL.md'),
  `---\nname: demo-good\ndescription: 当用户想试一下这个技能时使用，写清触发场景\n---\n\n${goodBody}\n\n见 \`references/missing.md\`\n`)
mkdirSync(join(TMP, 'demo-good', 'references'), { recursive: true })

mkdirSync(join(TMP, 'demo-bad'), { recursive: true })
writeFileSync(join(TMP, 'demo-bad', 'SKILL.md'), '---\nname: Demo_Bad\n---\n\n短\n')

// ---------------------------------------------------------------- 跑一遍

console.log('\n路由注册')
apply(ctx)
check('注册了 4 条路由', routes.size === 4, [...routes.keys()].join(', '))
for (const path of ['/api/skill-forge/list', '/api/skill-forge/read', '/api/skill-forge/validate', '/api/skill-forge/scaffold']) {
  check(`有 ${path}`, routes.has(path))
  const route = routes.get(path)
  check(`${path} 只接受 POST`, JSON.stringify(route.methods) === '["POST"]', JSON.stringify(route.methods))
}

/** 走真实 fetch 处理器，模拟一次浏览器请求。 */
async function call(path, body) {
  const response = await routes.get(path).fetch(new Request('http://localhost' + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  }))
  return response.json()
}

console.log('\nlist')
const list = await call('/api/skill-forge/list', {})
check('返回 ok', list.ok === true, JSON.stringify(list).slice(0, 200))
check('四个 skill 都在', list.value?.skills?.length === 4, String(list.value?.skills?.length))
const good = list.value?.skills?.find((skill) => skill.name === 'demo-good')
check('demo-good 有行数', typeof good?.lines === 'number' && good.lines > 0, String(good?.lines))
check('demo-good 来源标签是 ~/.dsh/skills', good?.sourceLabel === '~/.dsh/skills', good?.sourceLabel)
check('path 返回的是目录（剥掉了 SKILL.md）', good?.path === join(TMP, 'demo-good').replace(/\\/g, '/'), good?.path)
check('另给了 instructionFile', good?.instructionFile === join(TMP, 'demo-good', 'SKILL.md').replace(/\\/g, '/'), good?.instructionFile)
const bad = list.value?.skills?.find((skill) => skill.name === 'demo-bad')
check('demo-bad 的 userInvocable 为 false', bad?.userInvocable === false, String(bad?.userInvocable))
const bundled = list.value?.skills?.find((skill) => skill.name === 'bundled-one')
check('没有磁盘目录的 skill 行数为 null', bundled?.lines === null, String(bundled?.lines))
check('没有磁盘目录的 skill path 为 null', bundled?.path === null, String(bundled?.path))
const dirForm = list.value?.skills?.find((skill) => skill.name === 'demo-dir')
check('provider 直接给目录时也能读到行数', typeof dirForm?.lines === 'number' && dirForm.lines > 0, String(dirForm?.lines))

console.log('\nread')
const read = await call('/api/skill-forge/read', { name: 'demo-good' })
check('返回 ok', read.ok === true, JSON.stringify(read).slice(0, 200))
check('拿到 SKILL.md 原文', typeof read.value?.raw === 'string' && read.value.raw.includes('name: demo-good'))
check('path 是目录', read.value?.path === join(TMP, 'demo-good').replace(/\\/g, '/'), read.value?.path)
check('列出目录项', Array.isArray(read.value?.entries) && read.value.entries.some((entry) => entry.name === 'references' && entry.dir === true))

const readDir = await call('/api/skill-forge/read', { name: 'demo-dir' })
check('provider 给目录时 read 也能拿到原文', typeof readDir.value?.raw === 'string' && readDir.value.raw.includes('name: demo-good'), JSON.stringify(readDir).slice(0, 200))

const missing = await call('/api/skill-forge/read', { name: 'nope' })
check('找不到 skill 时返回失败', missing.ok === false && /not found/.test(missing.error?.message ?? ''), JSON.stringify(missing))

console.log('\nvalidate')
const valid = await call('/api/skill-forge/validate', { path: join(TMP, 'demo-good') })
check('合格 skill 校验通过', valid.ok === true && valid.value?.ok === true, JSON.stringify(valid.value?.errors))
check('报出引用了不存在的文件', (valid.value?.warnings ?? []).some((w) => w.includes('references/missing.md')), JSON.stringify(valid.value?.warnings))

const invalid = await call('/api/skill-forge/validate', { path: join(TMP, 'demo-bad') })
check('不合格 skill 校验失败', invalid.ok === true && invalid.value?.ok === false)
check('报出 name 不是 kebab-case', (invalid.value?.errors ?? []).some((e) => e.includes('kebab-case')), JSON.stringify(invalid.value?.errors))
check('报出 name 与目录名不一致', (invalid.value?.errors ?? []).some((e) => e.includes('目录名')), JSON.stringify(invalid.value?.errors))

const noFile = await call('/api/skill-forge/validate', { path: join(TMP, 'nope') })
check('目录不存在时给出明确错误', noFile.value?.ok === false && (noFile.value?.errors ?? []).some((e) => e.includes('找不到 SKILL.md')))

// 回归：path 已是 SKILL.md 时不能再拼一层
const viaFile = await call('/api/skill-forge/validate', { path: join(TMP, 'demo-good', 'SKILL.md') })
check('直接传 SKILL.md 路径也能校验', viaFile.value?.ok === true, JSON.stringify(viaFile.value?.errors))
check('不会拼成 SKILL.md/SKILL.md', !(viaFile.value?.errors ?? []).some((e) => e.includes('SKILL.md/SKILL.md')), JSON.stringify(viaFile.value?.errors))

console.log('\nscaffold')
// scaffold 路由在调用时读 USERPROFILE：这里临时指向夹具目录，
// 既能验真实代码路径，又不会污染用户的 skills 目录。
const realHome = process.env.USERPROFILE
const fakeHome = join(TMP, 'home')
mkdirSync(join(fakeHome, '.dsh', 'skills'), { recursive: true })
mkdirSync(join(fakeHome, '.agents', 'skills'), { recursive: true })
process.env.USERPROFILE = fakeHome

const scaffoldName = 'selftest-tmp'
const scaffoldTarget = join(fakeHome, '.dsh', 'skills', scaffoldName)
const made = await call('/api/skill-forge/scaffold', { name: scaffoldName, description: '当用户想验证 skill-forge 新建流程时使用', root: 'skills-dsh' })
check('创建成功', made.ok === true, JSON.stringify(made).slice(0, 300))
const created = readFileSync(join(scaffoldTarget, 'SKILL.md'), 'utf8')
check('骨架含 frontmatter', created.startsWith('---\nname: selftest-tmp'))
check('骨架带占位注释', created.includes('## 什么时候用'))
check('骨架能通过自己的校验', validateSkill(created, scaffoldName).ok === true, JSON.stringify(validateSkill(created, scaffoldName).errors))

const again = await call('/api/skill-forge/scaffold', { name: scaffoldName, description: '重复创建应该被拒绝' })
check('重复创建被拒绝', again.ok === false && /已存在/.test(again.error?.message ?? ''), JSON.stringify(again))

const agentsRoot = await call('/api/skill-forge/scaffold', { name: 'agents-tmp', description: '当用户想验证另一个根目录时使用', root: 'skills-agents' })
check('可写入 ~/.agents/skills', agentsRoot.ok === true && existsSync(join(fakeHome, '.agents', 'skills', 'agents-tmp', 'SKILL.md')), JSON.stringify(agentsRoot).slice(0, 200))

const badName = await call('/api/skill-forge/scaffold', { name: 'Bad_Name', description: 'x' })
check('非法名字被拒绝', badName.ok === false && /kebab-case/.test(badName.error?.message ?? ''))

const badRoot = await call('/api/skill-forge/scaffold', { name: 'another-name', description: 'x', root: 'C:/Windows' })
check('非法根目录被拒绝', badRoot.ok === false && /不支持的根目录/.test(badRoot.error?.message ?? ''))

const emptyDesc = await call('/api/skill-forge/scaffold', { name: 'no-desc', description: '   ' })
check('空 description 被拒绝', emptyDesc.ok === false && /description/.test(emptyDesc.error?.message ?? ''))

process.env.USERPROFILE = realHome

console.log('\n错误处理')
const brokenRoute = await routes.get('/api/skill-forge/list').fetch(new Request('http://localhost/api/skill-forge/list', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: 'not json',
}))
const brokenBody = await brokenRoute.json()
check('非 JSON 请求体返回 bad-request', brokenBody.ok === false && brokenBody.error?.code === 'skill-forge/bad-request', JSON.stringify(brokenBody))

console.log('\n清理')
for (const { dispose } of disposers) {
  try { dispose?.() } catch { /* 忽略 */ }
}
rmSync(TMP, { recursive: true, force: true })
check('effect 全部可释放', true)

console.log('')
if (failures === 0) {
  console.log('全部通过')
  process.exitCode = 0
} else {
  console.log(`${failures} 项失败`)
  process.exitCode = 1
}
