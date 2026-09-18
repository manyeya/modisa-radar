# radar

**Every agent at a glance, in modisa's sidebar.**

A [modisa](https://manyeya.github.io/modisa/) plugin. With a handful of coding agents open across a few projects,
radar answers the two questions you actually have — *who needs me?* and *what's everyone doing?* — without switching
into each pane.

```
2 need you · 1 working
shop
  ! @review  codex · 4m          ← blocked: asking you something
  └ fix-login
    ✓ @fix  claude-code · now    ← done: a result waiting for you to look
    ● @tests  claude-code · 1m   ← working
api
  · @docs  opencode · 12m        ← idle
  … @spike  claude-code · 3h     ← idle a long while: faded
```

- **Grouped by repository.** Agents sit under the repository they work in; a linked git worktree nests under its
  repository. Outside a repository, the directory's name is the group.
- **What needs you comes first.** Blocked, then done, then working, then idle — within a project and across projects.
  The section's title keeps the count.
- **Quiet agents fade.** Every row says how long since that agent's state last changed; idle for half an hour, its
  mark turns to `…`.
- **Click a row** to jump to that agent's pane.
- **`prefix g`** switches to one flat list, newest change first, and back.

## Install

```sh
modisa plugin install https://github.com/manyeya/modisa-radar.git
```

It starts with the session server; `modisa restart` if a session is already running. Needs [Bun](https://bun.sh) and,
for the grouping, `git` on your `PATH`.

`prefix g` is the default key. If it clashes with something of yours, move it in `config.toml`:

```toml
[plugin_keys]
"radar.order" = "y"
```

## How it knows

Everything comes from modisa itself: the panes it has detected an agent in, each one's state and working directory.
radar asks git which repository a directory belongs to (cached a minute per directory) and draws the section. It
reads nothing else, writes nothing but its own sidebar section, and never touches your agents or panes.

An agent's age counts from when radar saw its state change; one already running when radar starts counts from then.

## Develop

```sh
git clone https://github.com/manyeya/modisa-radar.git && cd modisa-radar
bun test radar.test.ts        # the layout, no session needed
modisa plugin check .         # everything, in a throwaway session
modisa plugin dev .           # try it by hand
```

`radar.ts` is the layout (pure, unit-tested); `plugin.ts` wires it to the session. `AGENTS.md` is modisa's guide to
writing plugins.

## License

MIT
