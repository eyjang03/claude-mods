# claude-mods

Eugene's Claude Code mods (function-hook plugins), one folder each, listed in `.claude-plugin/marketplace.json`. Both Macs install them from GitHub (`eyjang03/claude-mods`, marketplace `claude-mods`, user scope, auto-update), so a push to `main` reaches both Macs the next time the Claude app starts; already-open chats need `/reload-plugins`.

- Check a change with the Code tab's engine (2.1.293 or newer; an older terminal `claude` lacks `prompt.compose`): `claude plugin validate <mod>` and `claude plugin test <mod>`.
- `fold-turns`: on the Code tab only single tool rows take a mod's drawing; grouped "Ran N commands" rows can't be hidden, in-between messages fold only by blanking their text, and a Box with display/size/overflow/position around the engine's own row is refused with a visible error line. Hiding tool rows inside groups left blank boxes, so tool rows stay visible.
- Bump the mod's `version` in its `plugin.json` with each release.
