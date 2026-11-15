#!/usr/bin/env node
// Skill Forge 插件级自检：零依赖，跑 node test/selftest.mjs
//
// 检查两类东西：
//   1. 包结构与清单（package.json / cordis.patch.yml / locale / icon / client 导出）
//   2. Host 半边的纯函数（parseFrontmatter / validateSkill）行为正确

import { readFileSync, existsSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseFrontmatter, validateSkill } from '../lib/index.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let failures = 0

function check(label, condition, detail) {
  if (condition) {
    console.log(`  ok   ${label}`)
  } else {
    failures += 1
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

function section(title) {
  console.log(`\n${title}`)
}

// ------------------------------------------------------------- 包结构

section('包结构')

const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
check('name 是 dsh-skill-forge', manifest.name === 'dsh-skill-forge', manifest.name)
check('type 是 module', manifest.type === 'module')
check('main 指向 lib/index.js', manifest.main === 'lib/index.js', manifest.main)
check('exports 有 ./client', manifest.exports?.['./client'] === './lib/client.js', manifest.exports?.['./client'])
check('dsh.bundle.patch 已声明', manifest.dsh?.bundle?.patch === './cordis.patch.yml')
check('dsh.client.platform 是 web', manifest.dsh?.client?.platform === 'web', manifest.dsh?.client?.platform)
check('dsh.client.inject 含 layout', (manifest.dsh?.client?.inject ?? []).includes('@deepseek-ai/dsh-client-ui-layout'))
check('dsh.client.inject 含 sidebar', (manifest.dsh?.client?.inject ?? []).includes('@deepseek-ai/dsh-client-ui-sidebar'))

for (const file of ['lib/index.js', 'lib/client.js', 'cordis.patch.yml', 'icon.svg', 'locale/en.json', 'locale/zh.json', 'docs/DETAIL.md']) {
  check(`文件存在: ${file}`, existsSync(join(ROOT, file)))
}

const patch = readFileSync(join(ROOT, 'cordis.patch.yml'), 'utf8')
check('patch 插入了 skill-forge 行', /id:\s*skill-forge/.test(patch) && /name:\s*'dsh-skill-forge'/.test(patch))

for (const locale of ['en', 'zh']) {
  const json = JSON.parse(readFileSync(join(ROOT, `locale/${locale}.json`), 'utf8'))
  check(`locale/${locale}.json 有 meta.title`, typeof json.meta?.title === 'string' && json.meta.title.length > 0)
  check(`locale/${locale}.json 有 meta.description`, typeof json.meta?.description === 'string' && json.meta.description.length > 0)
  check(`locale/${locale}.json 的 detail 指向存在的文件`, existsSync(join(ROOT, json.meta?.detail ?? '')))
}

const icon = readFileSync(join(ROOT, 'icon.svg'), 'utf8')
check('icon.svg 是合法 SVG', icon.trimStart().startsWith('<svg') && icon.trimEnd().endsWith('</svg>'))
check('icon.svg 小于 256 KiB', statSync(join(ROOT, 'icon.svg')).size < 256 * 1024)

const client = readFileSync(join(ROOT, 'lib/client.js'), 'utf8')
check('client 用 __ModuleLoader__.load 注册', client.includes('window.__ModuleLoader__.load'))
check('client 注册 id 与包名一致', client.includes("id: 'dsh-skill-forge'"))
check('client 注册了 main 槽', client.includes("ctx.slots.inject('main'"))
check('client 注册了 sidebar.panellist 槽', client.includes("ctx.slots.inject('sidebar.panellist'"))
check('client 没有 require 宿主 Client 包', !/require\('@deepseek-ai\/dsh-client-/.test(client))

// ------------------------------------------------------- frontmatter 解析

section('parseFrontmatter')

const plain = parseFrontmatter('---\nname: demo\ndescription: 当用户要试一下时使用\n---\n\n正文\n')
check('解析普通标量', plain.values.name === 'demo' && plain.values.description === '当用户要试一下时使用')
check('正文不含 frontmatter', plain.body.trim() === '正文')
check('没有解析问题', plain.problems.length === 0)

const quoted = parseFrontmatter('---\nname: demo\ndescription: "带: 冒号的值"\n---\nbody\n')
check('去掉引号且保留冒号', quoted.values.description === '带: 冒号的值', quoted.values.description)

const block = parseFrontmatter('---\nname: demo\ndescription: |\n  第一行\n  第二行\n---\nbody\n')
check('块标量按行拼接', block.values.description === '第一行\n第二行', JSON.stringify(block.values.description))

let threw = false
try { parseFrontmatter('name: demo\n') } catch { threw = true }
check('缺开头 --- 时抛错', threw)

threw = false
try { parseFrontmatter('---\nname: demo\n') } catch { threw = true }
check('未闭合 frontmatter 时抛错', threw)

// ---------------------------------------------------------- validateSkill

section('validateSkill')

const goodBody = '正文'.repeat(60)
const good = validateSkill(`---\nname: demo\ndescription: 当用户想试一下这个技能时使用，写清触发场景\n---\n\n${goodBody}\n`, 'demo')
check('合格 skill 通过', good.ok, JSON.stringify(good.errors))

const badName = validateSkill(`---\nname: Demo_Skill\ndescription: 当用户想试一下这个技能时使用\n---\n\n${goodBody}\n`, 'Demo_Skill')
check('非 kebab-case 的 name 报错', !badName.ok && badName.errors.some((e) => e.includes('kebab-case')))

const mismatch = validateSkill(`---\nname: demo\ndescription: 当用户想试一下这个技能时使用\n---\n\n${goodBody}\n`, 'other-dir')
check('name 与目录名不一致报错', !mismatch.ok && mismatch.errors.some((e) => e.includes('目录名')))

const unknown = validateSkill(`---\nname: demo\ndescription: 当用户想试一下这个技能时使用\nfoo: bar\n---\n\n${goodBody}\n`, 'demo')
check('未知 frontmatter 字段报错', !unknown.ok && unknown.errors.some((e) => e.includes('未知字段')))

const noDesc = validateSkill(`---\nname: demo\n---\n\n${goodBody}\n`, 'demo')
check('缺 description 报错', !noDesc.ok && noDesc.errors.some((e) => e.includes('缺 description')))

const shortDesc = validateSkill(`---\nname: demo\ndescription: 管理技能\n---\n\n${goodBody}\n`, 'demo')
check('description 太短给提醒', shortDesc.warnings.some((w) => w.includes('太短')), JSON.stringify(shortDesc.warnings))
check('description 没写何时用给提醒', shortDesc.warnings.some((w) => w.includes('什么时候用')), JSON.stringify(shortDesc.warnings))

const tooLong = validateSkill(`---\nname: demo\ndescription: 当用户想试一下这个技能时使用\n---\n\n${'行\n'.repeat(520)}\n`, 'demo')
check('正文超过 500 行报错', !tooLong.ok && tooLong.errors.some((e) => e.includes('500')))

const thin = validateSkill('---\nname: demo\ndescription: 当用户想试一下这个技能时使用\n---\n\n短\n', 'demo')
check('正文太短报错', !thin.ok && thin.errors.some((e) => e.includes('正文太短')))

const broken = validateSkill('name: demo\n', 'demo')
check('frontmatter 坏了直接返回错误', !broken.ok && broken.errors.length > 0)

// ------------------------------------------------------------------ 结果

console.log('')
if (failures === 0) {
  console.log('全部通过')
  process.exitCode = 0
} else {
  console.log(`${failures} 项失败`)
  process.exitCode = 1
}
