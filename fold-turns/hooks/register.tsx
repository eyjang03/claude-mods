import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement, RenderInput } from 'claude-code'

import type { Fold } from '../types'
import { computeFolds, duration, foldOfText, foldOfTool, mergeFolds, steps } from './fold'

const folds = atom({ plugin: 'fold-turns', key: 'folds' } as const, [])
const open = atom({ plugin: 'fold-turns', key: 'open' } as const, [])
const showAll = atom({ plugin: 'fold-turns', key: 'showAll' } as const, false)

const KEEP_SESSIONS = 100

// Labels ("Worked for 2m 5s · 9 steps") live in $.store per session so they
// survive an app restart; folds themselves are recomputed from the transcript.
async function loadLabels($: EngineInterface): Promise<Record<string, string>> {
  const saved = await $.store.get(`labels:${await $.session.id()}`)
  return (saved ?? {}) as Record<string, string>
}

async function saveLabel($: EngineInterface, id: string, label: string) {
  const key = `labels:${await $.session.id()}`
  const labels = { ...(await loadLabels($)), [id]: label }
  await $.store.delete(key)
  await $.store.set(key, labels)
  const keys = (await $.store.keys()).filter(k => k.startsWith('labels:'))
  for (const k of keys.slice(0, Math.max(0, keys.length - KEEP_SESSIONS))) await $.store.delete(k)
}

async function rebuild($: EngineInterface) {
  const fresh = computeFolds(await $.session.messages(), await loadLabels($))
  await update($, folds, old => mergeFolds(old, fresh))
}

async function toggle($: EngineInterface, id: string) {
  await update($, open, ids => (ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]))
}

// Only in-between messages fold: the desktop draws its tool rows inside groups
// a mod can't hide, and hiding the rows within left blank boxes when a group was
// opened. A message folds by blanking its text, the one way the desktop honours.
// The anchor (the turn's first tool row) carries the turn's toggle above it.
async function isOpen($: EngineInterface, fold: Fold) {
  return (await read($, showAll)) || (await read($, open)).includes(fold.id)
}

async function drawAnchor<E extends RenderInput>($: EngineInterface, e: E, fold: Fold, next: (e: E) => Promise<RenderElement>) {
  const { Box, Button } = $.ui.resolve(e)
  const label = `${(await isOpen($, fold)) ? '▾' : '▸'} ${fold.label}`
  return (
    <Box flexDirection="column">
      <Button key={`fold:${fold.id}`} plain dimColor label={label} onPress={() => toggle($, fold.id)} />
      {await next(e)}
    </Box>
  )
}


// The answer still sits among the desktop's tool rows, so the mod asks for a
// rule and a heading on it (the rule alone draws too faint there).
const DIVIDER = {
  id: 'fold-turns:divider',
  scope: 'session',
  text: 'When a turn used tools, begin your final message of that turn (the answer that follows the work) with a line containing only `---`, a blank line, then a level-2 markdown heading of a few words stating the outcome (for example `## Divider fixed`), so the answer stands out from the progress messages above it. Never put these on progress messages, and skip them when the turn used no tools.',
} as const

export const register: Register = on => {
  let lastToolId: string | undefined

  on('prompt.compose', async ($, e, next) => {
    const result = await next(e)
    return { ...result, sections: [...result.sections, DIVIDER] }
  })

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await rebuild($)
    return result
  })

  on('turn.start', ($, e, next) => {
    lastToolId = undefined
    return next(e)
  })

  on('tool.call', ($, e, next) => {
    if (e.agentId === undefined && e.tool_use_id) lastToolId = e.tool_use_id
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined) return result
    const fresh = computeFolds(await $.session.messages(), await loadLabels($))
    const mine = lastToolId === undefined ? undefined : foldOfTool(fresh, lastToolId)
    if (mine) {
      mine.label = `${e.isAborted ? 'Stopped after' : 'Worked for'} ${duration(e.durationMs)} · ${steps(mine.toolIds.length)}`
      await saveLabel($, mine.id, mine.label)
    }
    await update($, folds, old => mergeFolds(old, fresh))
    return result
  })

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const fold = foldOfTool(await read($, folds), e.props.tool_use_id)
    return fold?.id === e.props.tool_use_id ? drawAnchor($, e, fold, next) : next(e)
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const fold = foldOfText(await read($, folds), e.props.text)
    if (!fold || (await isOpen($, fold))) return next(e)
    return next({ ...e, props: { ...e.props, text: '' } })
  })

  // One always-visible switch above the message box for every reply at once.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, folds)).length === 0) return next(e)
    const { Button } = $.ui.resolve(e)
    const all = await read($, showAll)
    return <Button key="show-progress" plain dimColor label={all ? 'Hide progress' : 'Show progress'} onPress={() => update($, showAll, v => !v)} />
  })
}
