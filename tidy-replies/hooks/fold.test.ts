import { expect, test } from 'claude-code/testing'
import type { SessionMessage } from 'claude-code'

import { computeFolds, foldOfText, foldOfTool, mergeFolds } from './fold'

const user = (text: string): SessionMessage => ({ role: 'user', text, toolUses: [] })
const result = (tool_use_id = 'x'): SessionMessage => ({ role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id, text: 'ok', isError: false } as any] })
const ai = (text: string, ...ids: string[]): SessionMessage => ({
  role: 'assistant',
  text,
  toolUses: ids.map(tool_use_id => ({ tool_use_id, tool: tool_use_id.startsWith('s') ? 'Skill' : 'Bash', input: {} }) as any),
})

test('folds the work of a turn and keeps its answer', async () => {
  const folds = computeFolds([
    user('do it'),
    ai('Looking at the files'),
    ai('', 't1'),
    result('t1'),
    ai('', 's1'),
    result('s1'),
    user('Base directory for this skill: ...'), // skill body injected mid-turn
    ai('', 't2'),
    result('t2'),
    ai('Done: here is the answer'),
    user('thanks'),
    ai('You are welcome'),
  ])
  expect(folds.length).toBe(1)
  const [fold] = folds
  expect(fold?.id).toBe('t1')
  expect(fold?.toolIds).toEqual(['t1', 's1', 't2'])
  expect(fold?.label).toBe('Worked · 3 steps')
  expect(foldOfTool(folds, 't2')?.id).toBe('t1')
  expect(foldOfText(folds, '  Looking at the files ')).toBeDefined()
  expect(foldOfText(folds, 'Done: here is the answer')).toBeUndefined()
  expect(foldOfText(folds, 'You are welcome')).toBeUndefined()
})

test('a stale fold never survives next to its recomputed turn', async () => {
  const stale = [{ id: 't2', toolIds: ['t2'], texts: [], label: 'old' }]
  const kept = [{ id: 'a1', toolIds: ['a1'], texts: [], label: 'out of window' }]
  const fresh = [{ id: 't1', toolIds: ['t1', 't2'], texts: [], label: 'new' }]
  expect(mergeFolds([...kept, ...stale], fresh).map(f => f.id)).toEqual(['a1', 't1'])
})

test('an interrupted turn and the next prompt stay separate', async () => {
  const folds = computeFolds([
    user('first'),
    ai('', 'a1'),
    result('a1'),
    user('[Request interrupted by user for tool use]'),
    user('second'),
    ai('', 'b1'),
    result('b1'),
    ai('Answer two'),
  ])
  expect(folds.map(f => f.toolIds)).toEqual([['a1'], ['b1']])
})
