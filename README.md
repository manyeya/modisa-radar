# radar

**Every agent at a glance, in modisa's sidebar.**

A [modisa](https://manyeya.github.io/modisa/) plugin. With a handful of coding agents open across a few projects,
radar answers the two questions you actually have — *who needs me?* and *what's everyone on?* — without switching
into each pane.

```
▾ radar                              13
3 need you · 5 working
notify-gateway
  ❖ ? @qwen · Pin the flaky test         ← blocked: it's asking you something
  π ⠿ @pi · Add contract tests           ← working
  □ · @opencode · Split the fan-out…     ← idle
edge-router
  ▦ ✓ @kilo · Reproduce the flaky r…     ← done: a result waiting for you to look
  └ ⎇ spike-cache-layer                  ← a git worktree, under its repository
    ĸ ? @kimi · Drain the dead-lett…
```

In the TUI each row is in colour: the agent's mark in its brand colour, then its state, its name and the task
it's on, all in your theme's colour for that state; working rows are bold.

- **Grouped by repository.** Agents sit under the repository they work in; a linked git worktree nests under its
  repository. Outside a repository, the directory's name is the group.
- **What needs you comes first.** Blocked, then done, then working, then idle — within a project and across
  projects. The section's title keeps the count.
- **The task, not just the agent.** Each row shows what the agent's terminal title says it's doing.
- **Quiet agents fade.** An agent idle for half an hour dims, the whole row.
- **Click a row** to jump to that agent's pane.
- **`prefix g`** switches to one flat list, most recent change first, and back.

## Install

```sh
modisa plugin install https://github.com/manyeya/modisa-radar.git
```

It starts right away in any running session, and with every session after that. Needs [Bun](https://bun.sh) and,
for the grouping, `git` on your `PATH`.

Then give it the agent list's place, and the room to show tasks, in `~/.config/modisa/config.toml`:

```toml
[sidebar]
agents = "radar"   # radar's section instead of modisa's own agent list (it's back whenever radar isn't running)
width = 40         # or drag the sidebar's edge; up to 48 columns, at most a third of your terminal
```

Colours, marks and the agent-list takeover need modisa 0.1.10 or later. On an older modisa radar still works:
one colour per row, under modisa's own list.

`prefix g` is the default key. If it clashes with something of yours, move it:

```toml
[plugin_keys]
"radar.order" = "y"
```

## Uninstall

```sh
modisa plugin unlink radar
```

## How it knows

Everything comes from modisa itself: the panes it has detected an agent in, each one's state and working directory.
radar asks git which repository a directory belongs to (cached a minute per directory) and draws the section. It
reads nothing else, writes nothing but its own sidebar section, and never touches your agents or panes.

An agent's idle time counts from when radar saw its state change; one already idle when radar starts counts from then.

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
