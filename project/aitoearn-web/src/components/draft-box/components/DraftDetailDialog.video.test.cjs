const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const { test } = require('node:test')
const ts = require('typescript')

function setup() {
  const source = fs.readFileSync(`${__dirname}/DraftDetailDialog.tsx`, 'utf8')
  const ast = ts.createSourceFile('preview.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const declaration = ast.statements.find(node => ts.isVariableStatement(node)
    && node.declarationList.declarations.some(item => item.name.getText(ast) === 'MediaPreview'))
  const code = ts.transpileModule(declaration.getText(ast), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS },
  }).outputText
  let cursor = 0
  const hooks = []
  const pendingEffects = []
  const video = { pauseCount: 0, removed: [], loadCount: 0,
    pause() { this.pauseCount++ }, removeAttribute(name) { this.removed.push(name) }, load() { this.loadCount++ } }
  const component = vm.runInNewContext(`${code}; MediaPreview`, {
    require, exports: {}, memo: fn => fn,
    useState(initial) {
      const slot = cursor++
      if (!(slot in hooks)) hooks[slot] = initial
      return [hooks[slot], value => { hooks[slot] = value }]
    },
    useRef(initial) {
      const slot = cursor++
      return hooks[slot] ??= { current: initial }
    },
    useEffect(effect, deps) {
      const slot = cursor++
      const previous = hooks[slot]
      if (!previous || deps.some((dep, i) => dep !== previous.deps[i])) {
        pendingEffects.push(() => {
          previous?.cleanup?.()
          hooks[slot] = { deps, cleanup: effect() }
        })
      }
    },
    useTransClient: () => ({ t: key => key }),
    cn: (...args) => args.filter(Boolean).join(' '), styles: {},
    Navigation: {}, Pagination: {}, Swiper: 'swiper', SwiperSlide: 'slide',
    MediaImage: 'cover', LazyImage: 'image', ImageIcon: 'empty', Button: 'button', Play: 'play-icon',
    getOssThumbnailUrl: url => url,
  })
  const material = { id: 'draft', title: 'Video', coverUrl: '/cover.png',
    mediaList: [{ type: 'video', url: '/video.mp4' }, { type: 'video', url: '/second.mp4' }] }
  function nodes(tree) {
    if (!tree || typeof tree !== 'object') return []
    if (Array.isArray(tree)) return tree.flatMap(nodes)
    return [tree, ...nodes(tree.props?.children)]
  }
  return {
    video,
    render() {
      cursor = 0
      const tree = component({ material })
      const all = nodes(tree)
      const player = all.find(node => node.type === 'video')
      // Commit the rendered video ref, then flush real effect callbacks.
      const ref = hooks.find(item => item && typeof item === 'object' && 'current' in item)
      ref.current = player ? video : null
      pendingEffects.splice(0).forEach(effect => effect())
      return all
    },
    unmount() { hooks.forEach(hook => hook?.cleanup?.()) },
  }
}

test('draft details contain covers and play controls, with no video source before a click', () => {
  const env = setup()
  const nodes = env.render()
  assert.equal(nodes.filter(node => node.type === 'video').length, 0)
  assert.equal(nodes.filter(node => node.type === 'cover').length, 2)
  assert.equal(nodes.filter(node => node.type === 'button').length, 2)
})

test('only the clicked video is loaded; switching slides stops and releases it', () => {
  const env = setup()
  env.render().find(node => node.type === 'button').props.onClick()
  let nodes = env.render()
  const players = nodes.filter(node => node.type === 'video')
  assert.equal(players.length, 1)
  assert.equal(players[0].props.src, '/video.mp4')
  nodes.find(node => node.type === 'swiper').props.onSlideChange({ realIndex: 1 })
  nodes = env.render()
  assert.equal(nodes.filter(node => node.type === 'video').length, 0)
  assert.equal(env.video.pauseCount, 1)
  assert.deepEqual(env.video.removed, ['src'])
  assert.equal(env.video.loadCount, 1)
})

test('closing the draft details releases an active video', () => {
  const env = setup()
  env.render().find(node => node.type === 'button').props.onClick()
  env.render()
  env.unmount()
  assert.equal(env.video.pauseCount, 1)
  assert.deepEqual(env.video.removed, ['src'])
  assert.equal(env.video.loadCount, 1)
})
