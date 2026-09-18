// What the radar shows, worked out from what it knows: pure, so it's tested without a session.
import type { AgentState, SidebarRow, Tone } from "./modisa-plugin";

export type Order = "grouped" | "recent";

// One agent pane: `since` is when its state last changed (epoch ms), `project` the repository it works in (or the
// directory, outside one), `worktree` the linked worktree's name when it isn't the repository's main checkout.
export type Agent = { pane: string; instance: string; label: string; harness: string; state: AgentState; since: number; project: string; worktree?: string };

export const MAX_ROWS = 20; // modisa shows at most 20 sidebar rows per plugin
const WIDTH = 60; // and cuts a row's text at 60 characters

// Who needs you first: a question, then a finished result to look at, then work in progress, then the quiet ones.
const RANK: Record<AgentState, number> = { blocked: 0, done: 1, working: 2, idle: 3 };
const MARK: Record<AgentState, string> = { blocked: "!", done: "✓", working: "●", idle: "·" };
const TONE: Record<AgentState, Tone> = { blocked: "warn", done: "fg", working: "accent", idle: "dim" };

export const STALE_MS = 30 * 60_000; // idle this long and a row fades further: `…` instead of `·`

export function age(ms: number) {
  const m = Math.floor(Math.max(0, ms) / 60_000);
  return m < 1 ? "now" : m < 60 ? `${m}m` : m < 1440 ? `${Math.floor(m / 60)}h` : `${Math.floor(m / 1440)}d`;
}

const byNeed = (a: Agent, b: Agent) => RANK[a.state] - RANK[b.state] || b.since - a.since;
const fit = (text: string) => (text.length > WIDTH ? text.slice(0, WIDTH - 1) + "…" : text);

function row(a: Agent, now: number, indent: string, where = ""): SidebarRow {
  const stale = a.state === "idle" && now - a.since >= STALE_MS;
  const text = `${indent}${stale ? "…" : MARK[a.state]} ${a.label}  ${a.harness}${where} · ${age(now - a.since)}`;
  return { text: fit(text), tone: TONE[a.state], pane: a.pane, instance: a.instance };
}

// The section's title: what needs you, else what's running, else nothing to do.
export function title(agents: Agent[]) {
  const n = (s: AgentState) => agents.filter((a) => a.state === s).length;
  const parts = [n("blocked") && `${n("blocked")} need${n("blocked") === 1 ? "s" : ""} you`, n("done") && `${n("done")} done`, n("working") && `${n("working")} working`].filter(Boolean);
  return parts.length ? parts.join(" · ") : "all quiet";
}

// `grouped`: one header per project, ranked by its most pressing agent; worktrees nest under their repository.
// `recent`: every agent in one list, most recent change first, each with its project.
export function layout(agents: Agent[], now: number, order: Order): SidebarRow[] {
  let rows: SidebarRow[];
  if (order === "recent") {
    rows = [...agents].sort((a, b) => b.since - a.since).map((a) => row(a, now, "", `  ${a.project}${a.worktree ? `/${a.worktree}` : ""}`));
  } else {
    const projects = Map.groupBy(agents, (a) => a.project);
    const ranked = [...projects].map(([name, list]) => ({ name, list: list.sort(byNeed) })).sort((x, y) => byNeed(x.list[0]!, y.list[0]!) || x.name.localeCompare(y.name));
    rows = ranked.flatMap(({ name, list }) => {
      const main = list.filter((a) => !a.worktree);
      const trees = [...Map.groupBy(list.filter((a) => a.worktree), (a) => a.worktree!)];
      return [
        { text: fit(name), tone: "dim" as Tone },
        ...main.map((a) => row(a, now, "  ")),
        ...trees.flatMap(([tree, inTree]) => [{ text: fit(`  └ ${tree}`), tone: "dim" as Tone }, ...inTree.map((a) => row(a, now, "    "))]),
      ];
    });
  }
  if (rows.length <= MAX_ROWS) return rows;
  const shown = rows.slice(0, MAX_ROWS - 1);
  const hidden = agents.length - shown.filter((r) => r.pane).length;
  return [...shown, { text: `+${hidden} more`, tone: "dim" }];
}
