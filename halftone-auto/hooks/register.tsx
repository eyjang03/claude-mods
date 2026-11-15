import type { Register } from 'claude-code'

import { halftoneSvg } from './halftone'

const PLUGIN = 'halftone-auto'
const SCENE = 'halftone'

export const register: Register = on => {
  // No overrideColorScheme, so the window keeps following the app's appearance; the scene follows it on its own.
  // The glass keeps theme-examples' blur but no tint: the tint is drawn in the scene, where it can change with the mode.
  on('session.start', async ($, e, next) => {
    const set = await $.theme.set({ backdrop: { scene: SCENE, glass: { blur: 14, tint: '#808080', opacity: 0 } } })
    if (!set.isDrawn) {
      $.ui.status(set.reason)
    }
    return next(e)
  })

  on('ui.render', { component: 'Backdrop' }, ($, e, next) => {
    if (e.props.plugin !== PLUGIN || e.props.scene !== SCENE || e.surface !== 'desktop') {
      return next(e)
    }
    const { Svg } = $.ui.resolve(e)
    return <Svg isInteractive alt="A two-ink riso sunrise in breathing halftone dots" source={halftoneSvg()} />
  })
}
