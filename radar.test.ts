// The radar's layout, without a session.
import { test, expect } from "bun:test";
import { age, layout, MAX_ROWS, STALE_MS, title, type Agent } from "./radar";

const now = 10_000_000;
let n = 0;
const agent = (over: Partial<Agent>): Agent => ({ pane: `p${++n}`, instance: `i${n}`, label: `@a${n}`, harness: "claude-code", state: "idle", since: now, project: "app", ...over });

test("ages read in the largest whole unit", () => {
  expect([0, 59_000, 60_000, 59 * 60_000, 3 * 3_600_000, 2 * 86_400_000].map(age)).toEqual(["now", "now", "1m", "59m", "3h", "2d"]);
});

test("the title says who needs you before anything else, and 'all quiet' when nothing does", () => {
  expect(title([agent({ state: "blocked" }), agent({ state: "blocked" }), agent({ state: "working" })])).toBe("2 need you · 1 working");
  expect(title([agent({ state: "blocked" }), agent({ state: "done" })])).toBe("1 needs you · 1 done");
  expect(title([agent({ state: "idle" })])).toBe("all quiet");
});

test("grouped: projects ranked by their most pressing agent, agents by need then recency, worktrees nested", () => {
  const rows = layout([
    agent({ label: "@old", project: "api", state: "idle", since: now - 5 * 60_000 }),
    agent({ label: "@new", project: "api", state: "idle", since: now - 60_000 }),
    agent({ label: "@ask", project: "web", state: "blocked", since: now - 120_000 }),
    agent({ label: "@fix", project: "web", worktree: "fix-login", state: "working" }),
  ], now, "grouped");
  expect(rows.map((r) => r.text)).toEqual([
    "web",
    "  ! @ask  claude-code · 2m",
    "  └ fix-login",
    "    ● @fix  claude-code · now",
    "api",
    "  · @new  claude-code · 1m",
    "  · @old  claude-code · 5m",
  ]);
  expect(rows.map((r) => r.tone)).toEqual(["dim", "warn", "dim", "accent", "dim", "dim", "dim"]);
  expect(rows[1]).toMatchObject({ pane: expect.any(String), instance: expect.any(String) }); // a click focuses that process
  expect(rows[0]!.pane).toBeUndefined(); // headers aren't clickable
});

test("an agent idle past the stale mark fades to …", () => {
  const [, row] = layout([agent({ label: "@gone", since: now - STALE_MS - 1 })], now, "grouped");
  expect(row!.text).toBe("  … @gone  claude-code · 30m");
});

test("recent: one list, newest change first, each with its project", () => {
  const rows = layout([agent({ label: "@a", since: now - 60_000, project: "api" }), agent({ label: "@b", since: now, project: "web", worktree: "wt" })], now, "recent");
  expect(rows.map((r) => r.text)).toEqual(["· @b  claude-code  web/wt · now", "· @a  claude-code  api · 1m"]);
});

test("past the row limit, the last row counts what didn't fit, and long rows are cut", () => {
  const many = Array.from({ length: 30 }, (_, i) => agent({ label: `@agent-${i}`, project: "big" }));
  const rows = layout(many, now, "grouped");
  expect(rows).toHaveLength(MAX_ROWS);
  expect(rows.at(-1)).toEqual({ text: "+12 more", tone: "dim" }); // 1 header + 18 agents shown
  const [, long] = layout([agent({ label: "@" + "x".repeat(80) })], now, "grouped");
  expect(long!.text.length).toBe(60);
  expect(long!.text.endsWith("…")).toBe(true);
});
