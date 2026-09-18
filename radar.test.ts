// The radar's layout, without a session.
import { test, expect } from "bun:test";
import { layout, MAX_ROWS, STALE_MS, task, title, who, type Agent } from "./radar";

const now = 10_000_000;
let n = 0;
const agent = (over: Partial<Agent>): Agent => ({ pane: `p${++n}`, instance: `i${n}`, harness: "claude-code", title: "", state: "idle", since: now, project: "app", ...over });

test("an agent is its pane's name, else its short name; its task is the title without the agent's own mark", () => {
  expect(who(agent({ harness: "claude-code" }))).toBe("claude");
  expect(who(agent({ harness: "cursor-agent" }))).toBe("cursor");
  expect(who(agent({ harness: "codex", name: "review" }))).toBe("@review");
  expect(task(agent({ title: "✳ Audit the token cache" }))).toBe("Audit the token cache");
  expect(task(agent({ title: "⠋ Working…" }))).toBe("Working…");
  expect(task(agent({ harness: "codex", title: "codex" }))).toBe(""); // a title that's just the agent says nothing
});

test("the title says who needs you before anything else, and 'all quiet' when nothing does", () => {
  expect(title([agent({ state: "blocked" }), agent({ state: "blocked" }), agent({ state: "working" })])).toBe("2 need you · 1 working");
  expect(title([agent({ state: "blocked" }), agent({ state: "done" })])).toBe("1 needs you");
  expect(title([agent({ state: "done" }), agent({ state: "idle" })])).toBe("1 done");
  expect(title(Array.from({ length: 30 }, (_, i) => agent({ state: i % 2 ? "blocked" : "working" }))).length).toBeLessThanOrEqual(30);
  expect(title([agent({ state: "idle" })])).toBe("all quiet");
});

test("a row is the agent's icon, its state mark, who it is and its task, coloured by state", () => {
  const [, working] = layout([agent({ harness: "gemini", state: "working", title: "Cut p99 on the hot path" })], now, "grouped");
  expect(working).toMatchObject({
    text: "  ⠿ gemini · Cut p99 on the hot path", tone: "accent", // for a modisa that can't draw spans
    spans: [{ text: "  " }, { icon: "gemini" }, { text: " ⠿ ", tone: "working" }, { text: "gemini", tone: "working", bold: true }, { text: " · Cut p99 on the hot path", tone: "working" }],
  });
  const [, blocked] = layout([agent({ state: "blocked", title: "Which env file?" })], now, "grouped");
  expect(blocked!.spans!.slice(2)).toEqual([{ text: " ? ", tone: "blocked" }, { text: "claude", tone: "blocked" }, { text: " · Which env file?", tone: "blocked" }]);
  const [, done] = layout([agent({ state: "done" })], now, "grouped");
  expect(done!.spans!.slice(2)).toEqual([{ text: " ✓ ", tone: "done" }, { text: "claude", tone: "fg" }]); // no title, no " · "
  expect(working).toMatchObject({ pane: expect.any(String), instance: expect.any(String) }); // a click focuses that process
});

test("grouped: projects ranked by their most pressing agent, a blank line between them, worktrees nested", () => {
  const rows = layout([
    agent({ name: "old", project: "api", since: now - 5 * 60_000 }),
    agent({ name: "new", project: "api", since: now - 60_000 }),
    agent({ name: "ask", project: "web", state: "blocked" }),
    agent({ name: "fix", project: "web", worktree: "fix-login", state: "working" }),
  ], now, "grouped");
  expect(rows.map((r) => r.text)).toEqual(["web", "  ? @ask", "  └ ⎇ fix-login", "    ⠿ @fix", "", "api", "  · @new", "  · @old"]);
  expect(rows[0]).toEqual({ text: "web", tone: "dim", spans: [{ text: "web", tone: "dim", bold: true }] });
  expect(rows[0]!.pane).toBeUndefined(); // headers aren't clickable
});

test("an agent idle past the stale mark fades, the whole row", () => {
  const [, row] = layout([agent({ name: "gone", since: now - STALE_MS - 1, title: "Migrate the cache" })], now, "grouped");
  expect(row!.tone).toBe("dim");
  expect(row!.spans!.filter((s) => "text" in s && s.text.trim()).every((s) => "tone" in s && s.tone === "dim")).toBe(true);
});

test("recent: one list, newest change first, each with its project", () => {
  const rows = layout([agent({ name: "a", since: now - 60_000, project: "api" }), agent({ name: "b", since: now, project: "web", worktree: "wt" })], now, "recent");
  expect(rows.map((r) => r.text)).toEqual(["· @b · web/wt", "· @a · api"]);
});

test("past the row limit, the last row counts what didn't fit", () => {
  const rows = layout(Array.from({ length: 50 }, (_, i) => agent({ name: `agent-${i}`, project: "big" })), now, "grouped");
  expect(rows).toHaveLength(MAX_ROWS);
  expect(rows.at(-1)).toEqual({ text: "+12 more", tone: "dim" }); // 1 header + 38 agents shown
});
