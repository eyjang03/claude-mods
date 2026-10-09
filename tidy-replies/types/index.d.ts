export type Fold = {
  id: string
  label: string
  toolIds: string[]
  texts: string[]
}

declare module 'claude-code' {
  interface PluginState {
    'tidy-replies': { folds: Fold[]; open: string[] }
  }
}
