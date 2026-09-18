// What the radar shows, worked out from what it knows: pure, so it's tested without a session.
import type { AgentState, SidebarRow, Span, Tone } from "./modisa-plugin";

export type Order = "grouped" | "recent";

// One agent pane: `harness` is modisa's id for the agent (claude-code, codex, …), `title` the task its terminal title
// names, `since` when its state last changed (epoch ms), `project` the repository it works in (or the directory,
// outside one), `worktree` the linked worktree's name when it isn't the repository's main checkout.
export type Agent = { pane: string; instance: string; name?: string; harness: string; title: string; state: AgentState; since: number; project: string; worktree?: string };

export const MAX_ROWS = 40; // modisa shows at most 40 sidebar rows per plugin
export const STALE_MS = 30 * 60_000; // idle this long and the whole row fades

// Who needs you first: a question, then a finished result to look at, then work in progress, then the quiet ones.
const RANK: Record<AgentState, number> = { blocked: 0, done: 1, working: 2, idle: 3 };
const MARK: Record<AgentState, string> = { blocked: "?", done: "✓", working: "⠿", idle: "·" };
// the mark, the name and the task, in the theme's colours for each state
const LOOK: Record<AgentState, { mark: Tone; text: Tone; bold?: boolean }> = {
  working: { mark: "working", text: "working", bold: true },
  blocked: { mark: "blocked", text: "blocked" },
  done: { mark: "done", text: "fg" },
  idle: { mark: "dim", text: "fg" },
};
// for a modisa too old to draw spans: the whole row in one of the tones it knows
const PLAIN: Record<AgentState, Tone> = { blocked: "warn", working: "accent", done: "fg", idle: "dim" };

const byNeed = (a: Agent, b: Agent) => RANK[a.state] - RANK[b.state] || b.since - a.since;

// The pane's own name when it has one, else the agent's short name: claude-code → claude, cursor-agent → cursor.
export const who = (a: Agent) => (a.name ? `@${a.name}` : a.harness.replace(/-(code|agent|cli)$/, ""));
// The task from the terminal title, without the spinner or mark an agent puts in front of it.
export const task = (a: Agent) => {
  const t = a.title.replace(/^[^\p{L}\p{N}]+/u, "").trim();
  return t && t !== a.harness && t !== who(a) && t !== a.name ? t : "";
};

function row(a: Agent, now: number, indent: string, where = ""): SidebarRow {
  const stale = a.state === "idle" && now - a.since >= STALE_MS;
  const look = stale ? { mark: "dim" as Tone, text: "dim" as Tone } : LOOK[a.state];
  const detail = [task(a), where].filter(Boolean).join(" · ");
  const spans: Span[] = [
    ...(indent ? [{ text: indent }] : []),
    { icon: a.harness },
    { text: ` ${MARK[a.state]} `, tone: look.mark },
    { text: who(a), tone: look.text, ...(look.bold && { bold: true }) },
    ...(detail ? [{ text: ` · ${detail}`, tone: look.text }] : []),
  ];
  return { text: `${indent}${MARK[a.state]} ${who(a)}${detail ? ` · ${detail}` : ""}`, tone: stale ? "dim" : PLAIN[a.state], spans, pane: a.pane, instance: a.instance };
}

const header = (text: string): SidebarRow => ({ text, tone: "dim", spans: [{ text, tone: "dim", bold: true }] });

// The section's title (modisa keeps 30 characters of it): what needs you and what's running; finished work is on its
// rows, marked ✓. Nothing either way is "all quiet".
export function title(agents: Agent[]) {
  const n = (s: AgentState) => agents.filter((a) => a.state === s).length;
  const parts = [n("blocked") && `${n("blocked")} need${n("blocked") === 1 ? "s" : ""} you`, n("working") && `${n("working")} working`].filter(Boolean);
  return parts.length ? parts.join(" · ") : n("done") ? `${n("done")} done` : "all quiet";
}

// `grouped`: one header per project, ranked by its most pressing agent, a blank line between projects; worktrees nest
// under their repository. `recent`: every agent in one list, most recent change first, each with its project.
export function layout(agents: Agent[], now: number, order: Order): SidebarRow[] {
  let rows: SidebarRow[];
  if (order === "recent") {
    rows = [...agents].sort((a, b) => b.since - a.since).map((a) => row(a, now, "", `${a.project}${a.worktree ? `/${a.worktree}` : ""}`));
  } else {
    const projects = Map.groupBy(agents, (a) => a.project);
    const ranked = [...projects].map(([name, list]) => ({ name, list: list.sort(byNeed) })).sort((x, y) => byNeed(x.list[0]!, y.list[0]!) || x.name.localeCompare(y.name));
    rows = ranked.flatMap(({ name, list }, i) => {
      const main = list.filter((a) => !a.worktree);
      const trees = [...Map.groupBy(list.filter((a) => a.worktree), (a) => a.worktree!)];
      return [
        ...(i ? [{ text: "" }] : []),
        header(name),
        ...main.map((a) => row(a, now, "  ")),
        ...trees.flatMap(([tree, inTree]): SidebarRow[] => [
          { text: `  └ ⎇ ${tree}`, tone: "dim", spans: [{ text: "  └ ", tone: "dim" }, { text: `⎇ ${tree}`, tone: "fg" }] },
          ...inTree.map((a) => row(a, now, "    ")),
        ]),
      ];
    });
  }
  if (rows.length <= MAX_ROWS) return rows;
  const shown = rows.slice(0, MAX_ROWS - 1);
  const hidden = agents.length - shown.filter((r) => r.pane).length;
  return [...shown, { text: `+${hidden} more`, tone: "dim" }];
}
