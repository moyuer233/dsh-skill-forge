// Skill Forge — Host half.
//
// 只做确定性操作：列 skill、读 SKILL.md、校验、建骨架。四条 HTTP 路由给
// Client 面板调用；界面本身在 ./client.js。
//
// 依赖 ctx.skills（skill 注册表）与 ctx.connection（HTTP 路由注册）。

import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'

export const name = 'skill-forge'

/** 两个服务都是硬依赖：缺一个本插件就没有意义。 */
export const inject = ['connection', 'skills']

/** 允许新建 skill 的根目录（写文件的安全边界）。 */
const SCAFFOLD_ROOTS = new Set(['skills-dsh', 'skills-agents'])

const NO_STORE = { 'cache-control': 'no-store' }
const ALLOWED_KEYS = new Set(['name', 'description', 'whenToUse', 'license', 'allowed-tools', 'metadata'])
const MAX_BODY_LINES = 500
const MAX_DESCRIPTION = 1024

/** 统一响应包络：{ ok: true, value } / { ok: false, error }。 */
function ok(value) {
  return Response.json({ ok: true, value }, { headers: NO_STORE })
}

function fail(code, message) {
  return Response.json({ ok: false, error: { code, message } }, { headers: NO_STORE })
}

/**
 * 注册一条 POST 路由。
 * @param ctx Cordis 上下文
 * @param path 路由路径
 * @param handler (body) => Promise<unknown>
 * @param label effect 标签
 */
function route(ctx, path, handler, label) {
  const connection = ctx.get('connection')
  if (typeof connection?.fetch?.register !== 'function') return
  ctx.effect(() => connection.fetch.register({
    path,
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: async (request) => {
      let body = {}
      try {
        const parsed = await request.json()
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) body = parsed
      } catch {
        return fail('skill-forge/bad-request', 'body is not JSON')
      }
      try {
        return ok(await handler(body))
      } catch (error) {
        return fail('skill-forge/failed', String(error?.message ?? error))
      }
    },
  }), label)
}

/** 读 SKILL.md 的全文、行数与字节数；读不到返回 null。 */
async function readSkillFile(file) {
  try {
    const info = await stat(file)
    if (!info.isFile()) return null
    const raw = await readFile(file, 'utf8')
    return { raw, lines: raw.split(/\r?\n/).length, bytes: info.size }
  } catch {
    return null
  }
}

/** 归一化一个路径为正斜杠形式，便于拼接。 */
function slash(path) {
  return String(path ?? '').replace(/\\/g, '/').replace(/\/+$/, '')
}

/**
 * skill 摘要里的 `path` 指的是**指令文件**（SKILL.md）的路径，不是目录。
 * 见 @deepseek-ai/dsh-skill README：「Skill summaries retain the winning
 * provider's optional instruction-file `path`」。
 * 所以取目录要剥掉文件名；已经给成目录的（自定义 provider）也照样能用。
 * @returns { file, dir }
 */
function skillPaths(rawPath) {
  const full = slash(rawPath)
  if (full === '') return { file: null, dir: null }
  const lastSlash = full.lastIndexOf('/')
  const base = lastSlash === -1 ? full : full.slice(lastSlash + 1)
  const looksLikeFile = /\.[A-Za-z0-9]+$/.test(base) && base.toLowerCase() !== 'skill.md'
    ? true
    : base.toLowerCase() === 'skill.md'
  if (looksLikeFile) {
    return { file: full, dir: lastSlash === -1 ? '' : full.slice(0, lastSlash) }
  }
  return { file: `${full}/SKILL.md`, dir: full }
}

/**
 * 解析 SKILL.md 的 YAML frontmatter（只取注册需要的标量字段）。
 * 与 @deepseek-ai/dsh-skill 的解析规则一致：支持 | / > 块标量与引号包裹。
 */
export function parseFrontmatter(raw) {
  const lines = raw.split(/\r?\n/)
  if (lines[0]?.trim() !== '---') throw new Error('SKILL.md 必须以 --- 开头')
  const close = lines.findIndex((line, index) => index > 0 && line.trim() === '---')
  if (close === -1) throw new Error('SKILL.md frontmatter 没有闭合的 ---')

  const values = {}
  const problems = []
  const fm = lines.slice(1, close)
  for (let i = 0; i < fm.length; i++) {
    const line = fm[i]
    if (!line.trim() || line.trimStart().startsWith('#')) continue
    const match = line.match(/^([A-Za-z0-9_-]+):(?:[ \t]*(.*))?$/)
    if (!match) {
      problems.push(`无法解析的 frontmatter 行: ${line.trim().slice(0, 60)}`)
      continue
    }
    let value = (match[2] ?? '').trim()
    if (/^[|>][+-]?$/.test(value)) {
      const collected = []
      while (i + 1 < fm.length && (/^[ \t]+/.test(fm[i + 1]) || fm[i + 1].trim() === '')) {
        i++
        collected.push(fm[i].replace(/^[ \t]+/, ''))
      }
      value = collected.join(value.startsWith('>') ? ' ' : '\n').trim()
    } else if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    values[match[1]] = value
  }
  return { values, problems, body: lines.slice(close + 1).join('\n') }
}

/**
 * 校验一份 SKILL.md 原文。只查能客观判定的东西。
 * @param raw SKILL.md 全文
 * @param dirName skill 目录名（用于 name 一致性检查）
 */
export function validateSkill(raw, dirName) {
  const errors = []
  const warnings = []

  let parsed
  try {
    parsed = parseFrontmatter(raw)
  } catch (error) {
    return { ok: false, errors: [String(error?.message ?? error)], warnings }
  }

  const { values, problems, body } = parsed
  errors.push(...problems)

  for (const key of Object.keys(values)) {
    if (!ALLOWED_KEYS.has(key)) errors.push(`frontmatter 有未知字段: ${key}`)
  }

  const skillName = values.name
  if (!skillName) {
    errors.push('frontmatter 缺 name')
  } else {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(skillName)) errors.push(`name 必须是 kebab-case: ${skillName}`)
    if (dirName && dirName !== skillName) errors.push(`name ("${skillName}") 与目录名 ("${dirName}") 不一致`)
  }

  const description = values.description
  if (!description) {
    errors.push('frontmatter 缺 description')
  } else {
    if (description.length > MAX_DESCRIPTION) errors.push(`description 超过 ${MAX_DESCRIPTION} 字符（当前 ${description.length}）`)
    if (description.length < 30) warnings.push('description 太短，可能无法准确触发')
    if (!/当|时|use when|when the user|只要/i.test(description)) warnings.push('description 没写「什么时候用」，模型可能不知道何时加载')
  }

  const bodyLines = body.split('\n').length
  if (bodyLines > MAX_BODY_LINES) errors.push(`正文 ${bodyLines} 行，超过 ${MAX_BODY_LINES} 行上限，应拆到 references/`)
  if (body.trim().length < 100) errors.push('正文太短，没有实际内容')

  return { ok: errors.length === 0, errors, warnings, name: skillName, description, whenToUse: values.whenToUse, bodyLines }
}

/** 找 SKILL.md 里引用但不存在的相对文件。 */
async function missingReferences(dir, raw) {
  const missing = []
  const pattern = /`((?:references|scripts)\/[\w.-]+\.(?:md|mjs|js|py|sh))`/g
  let match
  while ((match = pattern.exec(raw)) !== null) {
    try {
      await stat(`${dir}/${match[1]}`)
    } catch {
      missing.push(match[1])
    }
  }
  return missing
}

/** 把 skill 来源归一化成给人看的目录标签。 */
function sourceLabel(source) {
  switch (source) {
    case 'user-dsh': return '~/.dsh/skills'
    case 'user-agents': return '~/.agents/skills'
    case 'project-dsh': return '.dsh/skills'
    case 'project-agents': return '.agents/skills'
    case 'bundled': return 'bundled'
    case 'runtime': return 'runtime'
    default: return String(source ?? 'custom')
  }
}

/** 从请求体取 cwd（可选）。 */
function cwdOf(body) {
  return typeof body.cwd === 'string' && body.cwd !== '' ? { cwd: body.cwd } : {}
}

export function apply(ctx) {
  // 两个服务都用 ctx.get() 取：既能在真实 Cordis 下工作（inject 已声明），
  // 也便于自检时用假 ctx 驱动。
  const skills = ctx.get('skills')
  if (typeof skills?.list !== 'function' || typeof skills?.get !== 'function') {
    throw new Error('dsh-skill-forge: 需要 ctx.skills 服务（请确认 @deepseek-ai/dsh-skill 已挂载）')
  }

  // ---- 列表：全部 skill 摘要 + SKILL.md 行数/字节 ----
  route(ctx, '/api/skill-forge/list', async (body) => {
    const listed = await skills.list(cwdOf(body))
    const out = []
    for (const skill of listed) {
      const paths = skillPaths(skill.path)
      const file = paths.file ? await readSkillFile(paths.file) : null
      out.push({
        name: skill.name,
        description: skill.description ?? '',
        whenToUse: skill.whenToUse,
        source: skill.source ?? 'custom',
        sourceLabel: sourceLabel(skill.source),
        provider: skill.provider,
        modelInvocable: skill.invocation?.modelInvocable !== false,
        userInvocable: skill.invocation?.userInvocable !== false,
        path: paths.dir,
        instructionFile: paths.file,
        lines: file?.lines ?? null,
        bytes: file?.bytes ?? null,
      })
    }
    return { skills: out }
  }, 'skill-forge: list route')

  // ---- 详情：SKILL.md 原文 + 目录清单 ----
  route(ctx, '/api/skill-forge/read', async (body) => {
    const wanted = typeof body.name === 'string' ? body.name : ''
    if (wanted === '') throw new Error('missing name')
    const definition = await skills.get(wanted, cwdOf(body))
    if (!definition) throw new Error(`skill not found: ${wanted}`)

    const paths = skillPaths(definition.path)
    const file = paths.file ? await readSkillFile(paths.file) : null
    let entries = []
    if (paths.dir) {
      try {
        entries = (await readdir(paths.dir, { withFileTypes: true }))
          .map((entry) => ({ name: entry.name, dir: entry.isDirectory() }))
          .sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name))
      } catch { /* 目录读不到就只给正文 */ }
    }

    return {
      name: definition.name,
      description: definition.description ?? '',
      whenToUse: definition.whenToUse,
      source: definition.source ?? 'custom',
      sourceLabel: sourceLabel(definition.source),
      path: paths.dir,
      instructionFile: paths.file,
      raw: file?.raw ?? null,
      content: definition.content ?? '',
      lines: file?.lines ?? null,
      bytes: file?.bytes ?? null,
      entries,
    }
  }, 'skill-forge: read route')

  // ---- 校验：直接读盘，不经过注册表 ----
  route(ctx, '/api/skill-forge/validate', async (body) => {
    // 面板传目录；也接受直接传 SKILL.md 的路径。
    const paths = skillPaths(body.path)
    if (!paths.file) throw new Error('missing path')
    const file = await readSkillFile(paths.file)
    if (file === null) return { ok: false, errors: [`找不到 SKILL.md: ${paths.file}`], warnings: [], path: paths.dir }
    const dirName = paths.dir.slice(paths.dir.lastIndexOf('/') + 1)
    const result = validateSkill(file.raw, dirName)
    result.missing = result.ok ? await missingReferences(paths.dir, file.raw) : []
    for (const rel of result.missing) result.warnings.push(`引用了不存在的文件: ${rel}`)
    result.path = paths.dir
    result.lines = file.lines
    result.bytes = file.bytes
    return result
  }, 'skill-forge: validate route')

  // ---- 新建：只允许写到两个用户级 skills 根 ----
  route(ctx, '/api/skill-forge/scaffold', async (body) => {
    const skillName = typeof body.name === 'string' ? body.name.trim() : ''
    const description = typeof body.description === 'string' ? body.description.trim() : ''
    const rootKey = typeof body.root === 'string' ? body.root : 'skills-dsh'
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(skillName)) throw new Error('name 必须是 kebab-case（小写字母、数字、连字符）')
    if (description === '') throw new Error('description 不能为空')
    if (!SCAFFOLD_ROOTS.has(rootKey)) throw new Error(`不支持的根目录: ${rootKey}`)

    const home = process.env.USERPROFILE ?? process.env.HOME ?? ''
    if (home === '') throw new Error('无法定位用户主目录')
    const root = slash(rootKey === 'skills-dsh' ? `${home}/.dsh/skills` : `${home}/.agents/skills`)
    const dir = `${root}/${skillName}`

    try {
      await stat(dir)
      throw new Error(`目录已存在: ${dir}`)
    } catch (error) {
      if (error?.message?.startsWith('目录已存在')) throw error
    }

    const template = [
      '---',
      `name: ${skillName}`,
      `description: ${description}`,
      '---',
      '',
      `# ${skillName}`,
      '',
      '<!-- 一段话说明这个 skill 要模型做什么。判断标准只有一条：模型读完它，能不能把事做对。 -->',
      '',
      '## 什么时候用',
      '',
      '<!-- 举 2-3 个用户真实会说的话。触发全靠 description，这里给模型判断边界的依据。 -->',
      '',
      '## 怎么做',
      '',
      '<!-- 写「为什么」而不只是「做什么」；给判据，不给口号。 -->',
      '',
      '## 边界',
      '',
      '<!-- 什么情况下不该用它。 -->',
      '',
    ].join('\n')

    await mkdir(dir, { recursive: true })
    await writeFile(`${dir}/SKILL.md`, template, 'utf8')
    return { path: dir, file: `${dir}/SKILL.md`, lines: template.split('\n').length, bytes: Buffer.byteLength(template, 'utf8') }
  }, 'skill-forge: scaffold route')
}
