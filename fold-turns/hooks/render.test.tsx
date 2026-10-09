import { expect, mock, test } from 'claude-code/testing'

import type { SessionMessage } from 'claude-code'

const ai = (text: string, ...ids: string[]): SessionMessage => ({
  role: 'assistant',
  text,
  toolUses: ids.map(tool_use_id => ({ tool_use_id, tool: 'Bash', input: {} }) as any),
})
const result: SessionMessage = { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: 'x', text: 'ok', isError: false } as any] }
const MESSAGES: SessionMessage[] = [
  { role: 'user', text: 'do it', toolUses: [] },
  ai('Looking at the files', 't1'),
  result,
  ai('', 't2'),
  result,
  ai('The answer'),
]
const call = (tool_use_id: string) => ({ tool_use_id, tool: 'Bash', input: { command: 'ls' }, isRunning: false, isErrored: false, isInterrupted: false })

test('a folded turn hides only its progress messages; the toggle and the button bring them back', async ($, on) => {
  on('session.messages', async () => ({ value: MESSAGES }))
  on('session.id', async () => ({ value: 'test-session' }))
  on('session.start', async (_, e) => ({ cwd: e.cwd }))
  // The engine's own row, standing in beneath the plugin: its text, or the tool name.
  on('ui.render', async ($, e) => {
    const { Text } = $.ui.resolve(e)
    const props = e.props as { text?: string; tool?: string }
    return <Text>{props.text ?? props.tool ?? ''}</Text>
  })
  mock.store(on)
  await $.session.start({ cwd: '/tmp', surface: null, isInteractive: true })
  for (const surface of ['desktop', 'terminal'] as const) {
    const anchor = await $.ui.mount({ plugin: 'fold-turns', surface, component: 'ToolUse', props: call('t1') })
    const rest = await $.ui.mount({ plugin: 'fold-turns', surface, component: 'ToolUse', props: call('t2') })
    const text = await $.ui.mount({ plugin: 'fold-turns', surface, component: 'AssistantMessage', props: { text: 'Looking at the files', isFirstOfReply: true } })
    const answer = await $.ui.mount({ plugin: 'fold-turns', surface, component: 'AssistantMessage', props: { text: 'The answer', isFirstOfReply: true } })

    // Folded: the toggle sits above the first command, commands stay, progress text goes.
    expect((await anchor.find({ key: 'fold:t1' }))?.text).toContain('▸ Worked · 2 steps')
    expect(await anchor.find({ type: 'Text', text: /Bash/ })).toBeDefined()
    expect(await rest.find({ type: 'Text', text: /Bash/ })).toBeDefined()
    expect(await text.find({ type: 'Text', text: /Looking/ })).toBeUndefined()
    expect(await answer.find({ type: 'Text', text: /The answer/ })).toBeDefined()

    // The reply's own toggle opens and closes it.
    await anchor.press({ key: 'fold:t1' })
    expect((await anchor.find({ key: 'fold:t1' }))?.text).toContain('▾')
    expect(await text.find({ type: 'Text', text: /Looking at the files/ })).toBeDefined()
    await anchor.press({ key: 'fold:t1' })
    expect(await text.find({ type: 'Text', text: /Looking/ })).toBeUndefined()

    for (const ui of [anchor, rest, text, answer]) await ui.unmount()
  }
})

test('a finished turn is labelled with its time', async ($, on) => {
  on('session.messages', async () => ({ value: MESSAGES }))
  on('session.id', async () => ({ value: 'test-session' }))
  on('turn.start', async (_, e) => e as any)
  on('tool.call', async () => ({ result: {}, text: 'ok' }) as any)
  on('turn.complete', async (_, e) => ({ text: e.answer }))
  on('ui.render', async ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{(e.props as { tool?: string }).tool ?? ''}</Text>
  })
  mock.store(on)
  await $.turn.start({ text: 'do it', turnId: 'x' } as any)
  await ($.tool.call as any)({ tool: 'Bash', command: 'ls', tool_use_id: 't2' })
  await $.turn.complete({ answer: 'The answer', durationMs: 125_000, isAborted: false, turnId: 'x', reason: 'answer' })
  const anchor = await $.ui.mount({ plugin: 'fold-turns', surface: 'desktop', component: 'ToolUse', props: call('t1') })
  expect((await anchor.find({ key: 'fold:t1' }))?.text).toContain('Worked for 2m 5s · 2 steps')
})

test('asks for a divider above the answer', async ($, on) => {
  on('prompt.compose', async () => ({ sections: [{ id: 'intro', text: 'base', scope: 'shared' }] }))
  const { sections } = await $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: ['desktop'], tools: ['Bash'], outputStyle: null, traits: [] })
  expect(sections.map(x => x.id)).toEqual(['intro', 'fold-turns:divider'])
})
