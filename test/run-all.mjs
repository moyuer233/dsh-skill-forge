#!/usr/bin/env node
// 一次跑完三个自检。零依赖的跑不了 Client 那套（要 react/jsdom），会跳过并说明。
//
// 跑法: node test/run-all.mjs
//      SF_REACT_DIR=H:/1/_rtest/node_modules node test/run-all.mjs

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const DEPS = process.env.SF_REACT_DIR ?? 'H:/1/_rtest/node_modules'

const suites = [
  { name: '包结构与纯函数', file: 'selftest.mjs', needsDeps: false },
  { name: 'Host 路由接线', file: 'host.mjs', needsDeps: false },
  { name: 'Client 面板渲染', file: 'client.mjs', needsDeps: true },
]

let failed = 0
for (const suite of suites) {
  if (suite.needsDeps && !existsSync(join(DEPS, 'react-dom'))) {
    console.log(`\n跳过「${suite.name}」：找不到 react-dom（设 SF_REACT_DIR，或按 README 装测试依赖）`)
    continue
  }
  console.log(`\n========== ${suite.name} ==========`)
  const result = spawnSync(process.execPath, [join(HERE, suite.file)], {
    stdio: 'inherit',
    env: { ...process.env, SF_REACT_DIR: DEPS },
  })
  if (result.status !== 0) failed += 1
}

console.log('')
if (failed === 0) {
  console.log('三个自检全部通过')
  process.exitCode = 0
} else {
  console.log(`${failed} 个自检未通过`)
  process.exitCode = 1
}
