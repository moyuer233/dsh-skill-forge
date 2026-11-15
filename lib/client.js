// Skill Forge — Client half.
//
// 左侧栏图标 + 主区面板。面板通过 Host 的 api/skill-forge/* 四条路由取数据，
// 所有样式走宿主主题 token（--dsw-alias-*），不引入自己的配色体系。

window.__ModuleLoader__.load({
  id: 'dsh-skill-forge',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useMemo, useRef, useState } = React

    const NS = 'skill-forge'
    const PANEL_ID = 'skill-forge'

    const zh = {
      'panel.title': '技能工坊',
      'panel.new': '新建 skill',
      'panel.refresh': '刷新',
      'panel.search': '搜索名字或描述',
      'panel.count': '{n} 个技能',
      'panel.empty': '没有匹配的技能',
      'panel.emptyHint': '换个关键词，或清空搜索框。',
      'panel.loading': '读取中',
      'panel.error': '读取失败',
      'panel.retry': '重试',
      'panel.pick': '从左边选一个技能',
      'panel.pickHint': '选中后可以看 SKILL.md 原文、跑校验、看目录结构。',
      'tab.overview': '概览',
      'tab.source': 'SKILL.md',
      'tab.validate': '校验',
      'tab.files': '文件',
      'field.name': '名字',
      'field.description': 'description',
      'field.whenToUse': '什么时候用',
      'field.source': '来源',
      'field.path': '目录',
      'field.size': '体积',
      'field.invocation': '调用方式',
      'field.model': '模型可调用',
      'field.user': '用户可调用',
      'field.yes': '是',
      'field.no': '否',
      'field.lines': '{n} 行',
      'field.bytes': '{n} 字节',
      'validate.run': '跑校验',
      'validate.running': '校验中',
      'validate.pass': '格式有效',
      'validate.fail': '有 {n} 个错误',
      'validate.warn': '{n} 个提醒',
      'validate.idle': '还没跑。点上面的按钮查一遍。',
      'validate.noPath': '这个 skill 没有磁盘目录，没法校验。',
      'new.title': '新建 skill',
      'new.name': '名字',
      'new.nameHint': '小写字母、数字、连字符',
      'new.description': 'description',
      'new.descriptionHint': '写清什么时候用，触发全靠它',
      'new.root': '放哪里',
      'new.rootDsh': '~/.dsh/skills（所有工作区）',
      'new.rootAgents': '~/.agents/skills（所有工作区）',
      'new.submit': '创建',
      'new.cancel': '取消',
      'new.creating': '创建中',
      'new.done': '已创建：{path}',
      'files.empty': '目录是空的',
    }

    const en = {
      'panel.title': 'Skill Forge',
      'panel.new': 'New skill',
      'panel.refresh': 'Refresh',
      'panel.search': 'Search name or description',
      'panel.count': '{n} skills',
      'panel.empty': 'No matching skills',
      'panel.emptyHint': 'Try another keyword, or clear the search.',
      'panel.loading': 'Loading',
      'panel.error': 'Failed to load',
      'panel.retry': 'Retry',
      'panel.pick': 'Pick a skill on the left',
      'panel.pickHint': 'Then read its SKILL.md, run validation, and inspect its directory.',
      'tab.overview': 'Overview',
      'tab.source': 'SKILL.md',
      'tab.validate': 'Validate',
      'tab.files': 'Files',
      'field.name': 'Name',
      'field.description': 'description',
      'field.whenToUse': 'When to use',
      'field.source': 'Source',
      'field.path': 'Directory',
      'field.size': 'Size',
      'field.invocation': 'Invocation',
      'field.model': 'Model can call',
      'field.user': 'User can call',
      'field.yes': 'Yes',
      'field.no': 'No',
      'field.lines': '{n} lines',
      'field.bytes': '{n} bytes',
      'validate.run': 'Run validation',
      'validate.running': 'Validating',
      'validate.pass': 'Valid',
      'validate.fail': '{n} errors',
      'validate.warn': '{n} warnings',
      'validate.idle': 'Not run yet. Use the button above.',
      'validate.noPath': 'This skill has no directory on disk, so it cannot be validated.',
      'new.title': 'New skill',
      'new.name': 'Name',
      'new.nameHint': 'lowercase letters, digits, hyphens',
      'new.description': 'description',
      'new.descriptionHint': 'Say when to use it; that text drives triggering',
      'new.root': 'Where',
      'new.rootDsh': '~/.dsh/skills (every workspace)',
      'new.rootAgents': '~/.agents/skills (every workspace)',
      'new.submit': 'Create',
      'new.cancel': 'Cancel',
      'new.creating': 'Creating',
      'new.done': 'Created: {path}',
      'files.empty': 'The directory is empty',
    }

    // ---------------------------------------------------------------- styles

    const CSS = `
.sf-page{display:flex;flex-direction:column;flex:1;min-height:0;padding:calc(20px + var(--dsh-frame-top-clearance,0px)) 24px 0 max(24px,var(--dsh-frame-leading-clearance,0px));color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.6;box-sizing:border-box}
.sf-page *,.sf-page *:before,.sf-page *:after{box-sizing:border-box}
.sf-page h1,.sf-page h2,.sf-page p{margin:0}
.sf-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding-bottom:16px;flex-shrink:0}
.sf-title{display:flex;align-items:baseline;gap:8px;min-width:0}
.sf-title h1{font-size:20px;line-height:1.3;font-weight:600;letter-spacing:-.01em}
.sf-count{font-size:12px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
.sf-tools{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end;min-width:0}
.sf-search{display:flex;align-items:center;gap:6px;height:32px;padding:0 10px;border-radius:8px;background:var(--dsw-alias-bg-layer-2);border:.5px solid transparent;min-width:180px;max-width:280px}
.sf-search:focus-within{border-color:var(--dsw-alias-border-l2);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-brand-primary) 12%,transparent)}
.sf-search svg{flex-shrink:0;color:var(--dsw-alias-label-secondary)}
.sf-search input{flex:1;min-width:0;border:0;outline:0;background:transparent;color:inherit;font:inherit;padding:0}
.sf-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:32px;padding:0 12px;border-radius:8px;border:.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:inherit;font:inherit;font-size:13px;cursor:pointer;white-space:nowrap}
.sf-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)}
.sf-btn:disabled{opacity:.5;cursor:not-allowed}
.sf-btn--primary{background:var(--dsw-alias-brand-primary);border-color:transparent;color:var(--dsw-alias-bg-base);font-weight:500}
.sf-btn--primary:hover:not(:disabled){background:var(--dsw-alias-brand-primary);opacity:.9}
.sf-btn--ghost{border-color:transparent;background:transparent}
.sf-btn--ghost:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)}
.sf-split{display:grid;grid-template-columns:minmax(220px,300px) minmax(0,1fr);gap:0;flex:1;min-height:0;border-top:.5px solid var(--dsw-alias-border-l1)}
.sf-list{min-width:0;min-height:0;overflow:auto;padding:8px 8px 24px 0;border-right:.5px solid var(--dsw-alias-border-l1)}
.sf-row{display:flex;flex-direction:column;gap:2px;width:100%;text-align:start;padding:8px 10px;border:0;border-radius:8px;background:transparent;color:inherit;font:inherit;cursor:pointer;min-width:0}
.sf-row:hover{background:var(--dsw-alias-bg-layer-2)}
.sf-row[aria-selected=true]{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 10%,transparent)}
.sf-row-name{display:flex;align-items:center;gap:6px;font-size:13px;font-weight:500;min-width:0}
.sf-row-name span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sf-row-desc{font-size:12px;color:var(--dsw-alias-label-secondary);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
.sf-dot{width:5px;height:5px;border-radius:50%;flex-shrink:0;background:var(--dsw-alias-state-success-primary)}
.sf-dot--warn{background:var(--dsw-alias-state-warn-primary)}
.sf-dot--idle{background:var(--dsw-alias-state-idle-primary)}
.sf-detail{min-width:0;min-height:0;overflow:auto;padding:16px 0 32px 20px;display:flex;flex-direction:column}
.sf-detail-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding-bottom:12px;flex-shrink:0}
.sf-detail-title{font-size:16px;font-weight:600;line-height:1.4;overflow-wrap:anywhere;min-width:0}
.sf-detail-sub{font-size:12px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere;margin-top:2px}
.sf-tabs{display:flex;align-items:stretch;gap:16px;border-bottom:.5px solid var(--dsw-alias-border-l1);flex-shrink:0;overflow-x:auto}
.sf-tabs button{border:0;border-bottom:2px solid transparent;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;padding:8px 2px 10px;cursor:pointer;white-space:nowrap}
.sf-tabs button[aria-selected=true]{color:var(--dsw-alias-label-primary);border-bottom-color:var(--dsw-alias-brand-primary);font-weight:500}
.sf-body{flex:1;min-height:0;padding-top:16px;display:flex;flex-direction:column;gap:12px}
.sf-dl{display:grid;grid-template-columns:96px minmax(0,1fr);gap:8px 16px;margin:0;font-size:13px}
.sf-dl dt{color:var(--dsw-alias-label-secondary)}
.sf-dl dd{margin:0;min-width:0;overflow-wrap:anywhere}
.sf-code{margin:0;font-family:var(--dsh-font-family-code,ui-monospace,SFMono-Regular,Consolas,monospace);font-size:12px;line-height:1.7;white-space:pre-wrap;overflow-wrap:anywhere;background:var(--dsw-alias-bg-layer-2);border-radius:8px;padding:14px;overflow:auto;max-height:100%}
.sf-note{font-size:12px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}
.sf-status{display:flex;align-items:flex-start;gap:8px;padding:10px 12px;border-radius:8px;background:var(--dsw-alias-bg-layer-2);font-size:12px;overflow-wrap:anywhere}
.sf-status--error{color:var(--dsw-alias-state-error-primary)}
.sf-status--ok{color:var(--dsw-alias-state-success-primary)}
.sf-status--warn{color:var(--dsw-alias-state-warn-primary)}
.sf-list-lines{display:flex;flex-direction:column;gap:6px;margin:0;padding:0;list-style:none;font-size:12px}
.sf-list-lines li{display:flex;gap:8px;align-items:flex-start;overflow-wrap:anywhere}
.sf-list-lines li:before{content:'';flex-shrink:0;width:5px;height:5px;border-radius:50%;margin-top:7px;background:currentColor;opacity:.5}
.sf-files{display:flex;flex-wrap:wrap;gap:6px;margin:0;padding:0;list-style:none}
.sf-files li{display:inline-flex;align-items:center;gap:5px;padding:3px 8px;border-radius:6px;background:var(--dsw-alias-bg-layer-2);font-size:12px;font-family:var(--dsh-font-family-code,ui-monospace,Consolas,monospace)}
.sf-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;text-align:center;padding:48px 24px;min-height:240px;color:var(--dsw-alias-label-secondary);margin:auto}
.sf-empty h2{font-size:14px;font-weight:500;color:var(--dsw-alias-label-primary)}
.sf-mask{position:fixed;inset:0;background:#0006;display:flex;align-items:center;justify-content:center;padding:24px;z-index:1000}
.sf-dialog{width:min(460px,100%);max-height:100%;display:flex;flex-direction:column;background:var(--dsw-alias-bg-overlay);border:.5px solid var(--dsw-alias-border-l1);border-radius:12px;box-shadow:0 18px 60px #0003;overflow:hidden}
.sf-dialog header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border-bottom:.5px solid var(--dsw-alias-border-l1)}
.sf-dialog header h2{font-size:14px;font-weight:600}
.sf-dialog-body{padding:16px;display:flex;flex-direction:column;gap:14px;overflow:auto;min-height:0}
.sf-dialog footer{display:flex;justify-content:flex-end;gap:8px;padding:12px 16px;border-top:.5px solid var(--dsw-alias-border-l1)}
.sf-field{display:flex;flex-direction:column;gap:5px;min-width:0}
.sf-field>label{font-size:12px;color:var(--dsw-alias-label-secondary)}
.sf-field input,.sf-field select{height:32px;padding:0 10px;border-radius:8px;border:.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:inherit;font:inherit;font-size:13px;min-width:0;outline:0}
.sf-field input:focus,.sf-field select:focus{border-color:var(--dsw-alias-border-l2);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-brand-primary) 12%,transparent)}
.sf-icon{display:block;flex-shrink:0}
@media(max-width:820px){
  .sf-page{padding:calc(16px + var(--dsh-frame-top-clearance,0px)) 16px 0 max(16px,var(--dsh-frame-leading-clearance,0px))}
  .sf-split{grid-template-columns:minmax(0,1fr)}
  .sf-list{border-right:0;border-bottom:.5px solid var(--dsw-alias-border-l1);padding:8px 0;max-height:38%}
  .sf-detail{padding:16px 0 24px}
}
`

    function Styles() {
      return h('style', null, CSS)
    }

    // ----------------------------------------------------------------- icons

    function Icon({ name, size = 16 }) {
      const paths = {
        search: ['M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15Z', 'm16 16 5 5'],
        refresh: ['M20 7a9 9 0 1 0 1 8', 'M20 2v5h-5'],
        plus: ['M12 5v14M5 12h14'],
        close: ['m6 6 12 12M18 6 6 18'],
        forge: ['M4 20h16', 'M6 20V9l6-5 6 5v11', 'M9 20v-5h6v5'],
        folder: ['M3 5h7l2 3h9v12H3z'],
        file: ['M4 3h10l6 6v12H4z', 'M14 3v6h6'],
        check: ['m5 12 4 4L19 6'],
        alert: ['M12 3 2 20h20L12 3Z', 'M12 9v5M12 17h.01'],
      }
      const d = paths[name] ?? paths.file
      return h('svg', {
        className: 'sf-icon', width: size, height: size, viewBox: '0 0 24 24',
        fill: 'none', stroke: 'currentColor', strokeWidth: 1.7,
        strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
      }, d.map((segment, index) => h('path', { key: index, d: segment })))
    }

    // --------------------------------------------------------------- api

    // 相对路径（不带前导斜杠）：应用可能挂在子路径下，dsh-context 也是这么做的。
    async function post(path, body) {
      const response = await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      })
      const payload = await response.json().catch(() => null)
      if (!payload || typeof payload !== 'object') throw new Error('响应不是 JSON')
      if (payload.ok !== true) throw new Error(payload.error?.message ?? '请求失败')
      return payload.value
    }

    // ------------------------------------------------------------ components

    function Status({ tone, children }) {
      const icon = tone === 'error' ? 'alert' : tone === 'ok' ? 'check' : 'alert'
      return h('div', { className: `sf-status sf-status--${tone}` }, h(Icon, { name: icon, size: 14 }), h('span', null, children))
    }

    function Empty({ title, hint, children }) {
      return h('div', { className: 'sf-empty' },
        h(Icon, { name: 'forge', size: 28 }),
        h('h2', null, title),
        hint ? h('p', { className: 'sf-note' }, hint) : null,
        children ?? null)
    }

    function Overview({ detail, t }) {
      const rows = [
        [t('field.name'), detail.name],
        [t('field.source'), detail.sourceLabel],
        [t('field.path'), detail.path ?? '—'],
        [t('field.size'), detail.lines === null ? '—' : `${t('field.lines', { n: detail.lines })} · ${t('field.bytes', { n: detail.bytes })}`],
      ]
      return h('div', { className: 'sf-body' },
        h('p', { className: 'sf-note' }, detail.description || '—'),
        detail.whenToUse ? h('p', { className: 'sf-note' }, `${t('field.whenToUse')}: ${detail.whenToUse}`) : null,
        h('dl', { className: 'sf-dl' }, rows.map(([label, value], index) => h(React.Fragment, { key: index },
          h('dt', null, label),
          h('dd', null, value ?? '—')))))
    }

    function SourceView({ detail, t }) {
      if (!detail.raw) {
        return h('div', { className: 'sf-body' }, h(Status, { tone: 'warn' }, t('validate.noPath')))
      }
      return h('div', { className: 'sf-body' }, h('pre', { className: 'sf-code' }, detail.raw))
    }

    function ValidateView({ detail, state, onRun, t }) {
      if (!detail.path) {
        return h('div', { className: 'sf-body' }, h(Status, { tone: 'warn' }, t('validate.noPath')))
      }
      const result = state?.result
      return h('div', { className: 'sf-body' },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
          h('button', {
            type: 'button', className: 'sf-btn', disabled: state?.busy,
            onClick: onRun,
          }, h(Icon, { name: state?.busy ? 'refresh' : 'check', size: 14 }), state?.busy ? t('validate.running') : t('validate.run'))),
        state?.error ? h(Status, { tone: 'error' }, state.error) : null,
        !state?.result && !state?.error && !state?.busy ? h('p', { className: 'sf-note' }, t('validate.idle')) : null,
        result ? h(React.Fragment, null,
          h(Status, { tone: result.ok ? 'ok' : 'error' },
            result.ok
              ? t('validate.pass') + (result.warnings.length ? ` · ${t('validate.warn', { n: result.warnings.length })}` : '')
              : t('validate.fail', { n: result.errors.length })),
          result.errors.length ? h('ul', { className: 'sf-list-lines', style: { color: 'var(--dsw-alias-state-error-primary)' } },
            result.errors.map((message, index) => h('li', { key: index }, message))) : null,
          result.warnings.length ? h('ul', { className: 'sf-list-lines', style: { color: 'var(--dsw-alias-state-warn-primary)' } },
            result.warnings.map((message, index) => h('li', { key: index }, message))) : null,
        ) : null)
    }

    function FilesView({ detail, t }) {
      if (!detail.entries?.length) {
        return h('div', { className: 'sf-body' }, h('p', { className: 'sf-note' }, t('files.empty')))
      }
      return h('div', { className: 'sf-body' },
        h('ul', { className: 'sf-files' }, detail.entries.map((entry, index) => h('li', { key: index },
          h(Icon, { name: entry.dir ? 'folder' : 'file', size: 13 }),
          h('span', null, entry.dir ? `${entry.name}/` : entry.name)))))
    }

    function NewSkillDialog({ t, onClose, onCreated }) {
      const [name, setName] = useState('')
      const [description, setDescription] = useState('')
      const [root, setRoot] = useState('skills-dsh')
      const [busy, setBusy] = useState(false)
      const [error, setError] = useState(null)
      const firstField = useRef(null)

      useEffect(() => {
        firstField.current?.focus()
        const onKey = (event) => {
          if (event.key === 'Escape' && !busy) {
            event.stopPropagation()
            onClose()
          }
        }
        window.addEventListener('keydown', onKey, true)
        return () => window.removeEventListener('keydown', onKey, true)
      }, [busy, onClose])

      const submit = useCallback(async () => {
        setBusy(true)
        setError(null)
        try {
          const created = await post('api/skill-forge/scaffold', { name, description, root })
          onCreated(created)
        } catch (problem) {
          setError(String(problem?.message ?? problem))
        } finally {
          setBusy(false)
        }
      }, [name, description, root, onCreated])

      return h('div', { className: 'sf-mask', onMouseDown: (event) => { if (event.target === event.currentTarget && !busy) onClose() } },
        h('section', { className: 'sf-dialog', role: 'dialog', 'aria-modal': true, 'aria-label': t('new.title') },
          h('header', null,
            h('h2', null, t('new.title')),
            h('button', { type: 'button', className: 'sf-btn sf-btn--ghost', onClick: onClose, disabled: busy, 'aria-label': t('new.cancel') }, h(Icon, { name: 'close', size: 14 }))),
          h('div', { className: 'sf-dialog-body' },
            h('div', { className: 'sf-field' },
              h('label', { htmlFor: 'sf-new-name' }, t('new.name')),
              h('input', {
                id: 'sf-new-name', ref: firstField, value: name, spellCheck: false,
                placeholder: 'my-skill', onChange: (event) => setName(event.target.value),
              }),
              h('span', { className: 'sf-note' }, t('new.nameHint'))),
            h('div', { className: 'sf-field' },
              h('label', { htmlFor: 'sf-new-desc' }, t('new.description')),
              h('input', {
                id: 'sf-new-desc', value: description,
                placeholder: t('new.descriptionHint'), onChange: (event) => setDescription(event.target.value),
              })),
            h('div', { className: 'sf-field' },
              h('label', { htmlFor: 'sf-new-root' }, t('new.root')),
              h('select', { id: 'sf-new-root', value: root, onChange: (event) => setRoot(event.target.value) },
                h('option', { value: 'skills-dsh' }, t('new.rootDsh')),
                h('option', { value: 'skills-agents' }, t('new.rootAgents')))),
            error ? h(Status, { tone: 'error' }, error) : null),
          h('footer', null,
            h('button', { type: 'button', className: 'sf-btn', onClick: onClose, disabled: busy }, t('new.cancel')),
            h('button', { type: 'button', className: 'sf-btn sf-btn--primary', onClick: submit, disabled: busy || !name.trim() || !description.trim() },
              busy ? t('new.creating') : t('new.submit')))))
    }

    function ForgePanel({ t }) {
      const [skills, setSkills] = useState([])
      const [loading, setLoading] = useState(true)
      const [error, setError] = useState(null)
      const [query, setQuery] = useState('')
      const [selected, setSelected] = useState(null)
      const [detail, setDetail] = useState(null)
      const [detailError, setDetailError] = useState(null)
      const [tab, setTab] = useState('overview')
      const [validation, setValidation] = useState({})
      const [creating, setCreating] = useState(false)
      const [notice, setNotice] = useState(null)

      const load = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
          const value = await post('api/skill-forge/list', {})
          setSkills(Array.isArray(value?.skills) ? value.skills : [])
        } catch (problem) {
          setError(String(problem?.message ?? problem))
        } finally {
          setLoading(false)
        }
      }, [])

      useEffect(() => { void load() }, [load])

      const open = useCallback(async (name) => {
        setSelected(name)
        setDetail(null)
        setDetailError(null)
        setTab('overview')
        try {
          const value = await post('api/skill-forge/read', { name })
          setDetail(value)
        } catch (problem) {
          setDetailError(String(problem?.message ?? problem))
        }
      }, [])

      const runValidation = useCallback(async () => {
        if (!detail?.path) return
        setValidation((current) => ({ ...current, [detail.name]: { busy: true, result: current[detail.name]?.result ?? null, error: null } }))
        try {
          const result = await post('api/skill-forge/validate', { path: detail.path })
          setValidation((current) => ({ ...current, [detail.name]: { busy: false, result, error: null } }))
        } catch (problem) {
          setValidation((current) => ({ ...current, [detail.name]: { busy: false, result: null, error: String(problem?.message ?? problem) } }))
        }
      }, [detail])

      const filtered = useMemo(() => {
        const needle = query.trim().toLowerCase()
        if (needle === '') return skills
        return skills.filter((skill) =>
          skill.name.toLowerCase().includes(needle) || (skill.description ?? '').toLowerCase().includes(needle))
      }, [skills, query])

      const created = useCallback(async (result) => {
        setCreating(false)
        setNotice(t('new.done', { path: result.path }))
        await load()
        const name = result.path.slice(result.path.lastIndexOf('/') + 1)
        await open(name)
      }, [load, open, t])

      const head = h('header', { className: 'sf-head' },
        h('div', { className: 'sf-title' },
          h('h1', null, t('panel.title')),
          h('span', { className: 'sf-count' }, t('panel.count', { n: filtered.length }))),
        h('div', { className: 'sf-tools' },
          h('div', { className: 'sf-search' },
            h(Icon, { name: 'search', size: 14 }),
            h('input', {
              type: 'search', value: query, 'aria-label': t('panel.search'),
              placeholder: t('panel.search'), onChange: (event) => setQuery(event.target.value),
            })),
          h('button', { type: 'button', className: 'sf-btn sf-btn--ghost', onClick: () => void load(), disabled: loading, 'aria-label': t('panel.refresh') },
            h(Icon, { name: 'refresh', size: 14 })),
          h('button', { type: 'button', className: 'sf-btn sf-btn--primary', onClick: () => setCreating(true) },
            h(Icon, { name: 'plus', size: 14 }), t('panel.new'))))

      let listBody
      if (loading && skills.length === 0) {
        listBody = h('p', { className: 'sf-note', style: { padding: '12px 10px' } }, t('panel.loading'))
      } else if (error) {
        listBody = h('div', { style: { padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 8 } },
          h(Status, { tone: 'error' }, `${t('panel.error')}: ${error}`),
          h('button', { type: 'button', className: 'sf-btn', onClick: () => void load() }, t('panel.retry')))
      } else if (filtered.length === 0) {
        listBody = h('p', { className: 'sf-note', style: { padding: '12px 10px' } }, t('panel.empty'))
      } else {
        listBody = filtered.map((skill) => {
          const state = validation[skill.name]?.result
          const tone = state ? (state.ok ? 'ok' : 'warn') : 'idle'
          return h('button', {
            key: skill.name, type: 'button', className: 'sf-row',
            'aria-selected': selected === skill.name,
            onClick: () => void open(skill.name),
          },
            h('span', { className: 'sf-row-name' },
              h('span', null, skill.name),
              h('span', { className: `sf-dot sf-dot--${tone === 'ok' ? 'ok' : tone === 'warn' ? 'warn' : 'idle'}`, 'aria-hidden': true })),
            h('span', { className: 'sf-row-desc' }, skill.description || skill.sourceLabel))
        })
      }

      let detailBody
      if (!selected) {
        detailBody = h(Empty, { title: t('panel.pick'), hint: t('panel.pickHint') })
      } else if (detailError) {
        detailBody = h('div', { className: 'sf-body' }, h(Status, { tone: 'error' }, detailError))
      } else if (!detail) {
        detailBody = h('p', { className: 'sf-note' }, t('panel.loading'))
      } else {
        const tabs = [
          ['overview', t('tab.overview')],
          ['source', t('tab.source')],
          ['validate', t('tab.validate')],
          ['files', t('tab.files')],
        ]
        detailBody = h(React.Fragment, null,
          h('div', { className: 'sf-detail-head' },
            h('div', { style: { minWidth: 0 } },
              h('div', { className: 'sf-detail-title' }, detail.name),
              h('div', { className: 'sf-detail-sub' }, detail.path ?? detail.sourceLabel))),
          h('div', { className: 'sf-tabs', role: 'tablist' }, tabs.map(([id, label]) =>
            h('button', {
              key: id, type: 'button', role: 'tab', 'aria-selected': tab === id,
              onClick: () => setTab(id),
            }, label))),
          tab === 'overview' ? h(Overview, { detail, t }) : null,
          tab === 'source' ? h(SourceView, { detail, t }) : null,
          tab === 'validate' ? h(ValidateView, { detail, state: validation[detail.name], onRun: runValidation, t }) : null,
          tab === 'files' ? h(FilesView, { detail, t }) : null)
      }

      return h('div', { className: 'sf-page' },
        h(Styles),
        head,
        notice ? h('div', { style: { paddingBottom: 10 } },
          h(Status, { tone: 'ok' }, notice),
          ) : null,
        h('div', { className: 'sf-split' },
          h('aside', { className: 'sf-list', role: 'listbox', 'aria-label': t('panel.title') }, listBody),
          h('section', { className: 'sf-detail' }, detailBody)),
        creating ? h(NewSkillDialog, { t, onClose: () => setCreating(false), onCreated: created }) : null)
    }

    function ForgeIcon({ size }) {
      return h(Icon, { name: 'forge', size: typeof size === 'number' ? size : 16 })
    }

    // ------------------------------------------------------------------ apply

    return {
      // name 决定槽注册归属的 plugin fiber；缺了会被归到宿主默认上下文。
      name: 'dsh-skill-forge',
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'skill-forge: dictionaries')
        const t = ctx.locale.bind(NS)

        // 语言切换后重渲染：订阅 locale 快照，变化就 bump 一次。
        function useLocaleTick() {
          const [, bump] = useState(0)
          useEffect(() => {
            const off = ctx.locale.subscribe(() => bump((value) => value + 1))
            return () => { off?.() }
          }, [])
        }

        function Panel() {
          useLocaleTick()
          return h(ForgePanel, { t })
        }

        // 侧栏会传 size / active；size 要透传，否则折叠成 56px 轨道时图标不跟着变。
        function IconEntry(props) {
          useLocaleTick()
          return h(ForgeIcon, { size: props?.size })
        }

        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main', key: PANEL_ID, locale: NS,
        }, Panel))

        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist', id: PANEL_ID, order: 30, locale: NS,
          label: () => t('panel.title'),
        }, IconEntry))
      },
    }
  },
})
