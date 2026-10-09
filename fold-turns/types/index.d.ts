export type Fold = {
  id: string
  label: string
  toolIds: string[]
  texts: string[]
}

declare module 'claude-code' {
  interface PluginState {
    'fold-turns': { folds: Fold[]; open: string[] }
  }
}
