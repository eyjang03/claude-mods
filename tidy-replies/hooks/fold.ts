import type { SessionMessage } from 'claude-code'

import type { Fold } from '../types'

// A real prompt is user text, except a skill's body, which the transcript stores
// as user text right after the Skill call's result, inside the same turn.
const isPrompt = (m: SessionMessage, prev: SessionMessage | undefined, skillIds: ReadonlySet<string>) =>
  m.role === 'user' &&
  !m.toolResults?.length &&
  m.text.trim() !== '' &&
  !prev?.toolResults?.some(r => skillIds.has(r.tool_use_id))

export const steps = (n: number) => `${n} step${n === 1 ? '' : 's'}`

export function duration(ms: number): string {
  const s = Math.round(ms / 1000)
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}

// Per turn: every tool call and every assistant text but the last (the answer)
// fold. The toggle sits on the first tool call, the one row always matched by id.
export function computeFolds(messages: readonly SessionMessage[], labels: Record<string, string> = {}): Fold[] {
  const skillIds = new Set(messages.flatMap(m => m.toolUses.filter(u => u.tool === 'Skill').map(u => u.tool_use_id)))
  const turns: SessionMessage[][] = []
  messages.forEach((m, i) => {
    if (isPrompt(m, messages[i - 1], skillIds)) turns.push([])
    else if (m.role === 'assistant') turns.at(-1)?.push(m)
  })

  const folds: Fold[] = []
  for (const turn of turns) {
    const answerAt = turn.findLastIndex(m => m.text.trim() !== '')
    const toolIds = turn.flatMap(m => m.toolUses.map(u => u.tool_use_id))
    const texts = turn.filter((m, i) => i !== answerAt && m.text.trim() !== '').map(m => m.text.trim())
    const id = toolIds[0]
    if (id === undefined) continue
    folds.push({ id, toolIds, texts, label: labels[id] ?? `Worked · ${steps(toolIds.length)}` })
  }
  return folds
}

// Keeps earlier folds that fell out of the 4096-message window, minus any the
// fresh pass recomputed (so a stale fold can never add a second toggle).
export function mergeFolds(old: readonly Fold[], fresh: readonly Fold[]): Fold[] {
  const seen = new Set(fresh.flatMap(f => f.toolIds))
  return [...old.filter(f => !f.toolIds.some(id => seen.has(id))), ...fresh]
}

// ponytail: linear scans per drawn row; index by id if transcripts get huge.
export const foldOfTool = (folds: readonly Fold[], toolId: string) => folds.find(f => f.toolIds.includes(toolId))

export const foldOfText = (folds: readonly Fold[], text: string) => {
  const t = text.trim()
  return t === '' ? undefined : folds.find(f => f.texts.includes(t))
}
