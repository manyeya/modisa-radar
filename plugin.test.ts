// Behavioural tests for radar, run against a real throwaway session by `modisa plugin check .`
import { test, expect, beforeAll, afterAll } from "bun:test";
import { checkSession } from "./modisa-plugin";

const s = checkSession();

// A repository with a linked worktree, for agents to work in.
let root = "", repo = "";
beforeAll(async () => {
  root = (await Bun.$`mktemp -d ${(Bun.env.TMPDIR ?? "/tmp").replace(/\/+$/, "")}/radar-XXXXXX`.text()).trim();
  repo = `${root}/shop`;
  await Bun.$`git init -q ${repo}`.quiet();
  await Bun.$`git -C ${repo} -c user.email=t@t -c user.name=t commit -q --allow-empty -m init`.quiet();
  await Bun.$`git -C ${repo} worktree add -q ${root}/shop-fix -b fix`.quiet();
}, 30_000);
afterAll(async () => void (await Bun.$`rm -rf ${root}`.quiet().nothrow()), 30_000);

// A pane modisa sees as an agent in `state`, reported the way agent integrations do: a long-running process in a
// shell's foreground, reported until modisa shows it.
async function agent(name: string, cwd: string) {
  const id = (await s.modisa("pane", "split", "--name", name, "--cwd", cwd)).stdout;
  await s.modisa("pane", "run", id, "sleep 600");
  const to = async (state: "working" | "blocked" | "done" | "idle") => {
    for (let i = 0; i < 10; i++) {
      await s.modisa("report", id, "--source", "radar-test", "--agent", "codex", "--state", state);
      if ((await s.modisa("wait", id, "--state", state, "--timeout", "1")).code === 0) return;
    }
    throw new Error(`${name} never showed as ${state}`);
  };
  return { id, to };
}
const texts = async () => (await s.ui()).sidebar?.rows.map((r) => r.text) ?? [];

test("agents show under their repository, worktrees nested, the one that needs you first; `order` flips to recent", async () => {
  const main = await agent("main", repo);
  const fix = await agent("fix", `${root}/shop-fix`);
  await main.to("working");
  await fix.to("blocked");

  await s.until("the radar to group them", async () => {
    const t = await texts();
    return t.includes("shop") && t.some((x) => x.startsWith("  ● @main")) && t.includes("  └ shop-fix") && t.some((x) => x.startsWith("    ! @fix"));
  });
  const ui = await s.ui();
  expect(ui.sidebar?.title).toBe("1 needs you · 1 working");
  const panes = await s.json<any[]>("pane", "list");
  const fixRow = ui.sidebar!.rows.find((r) => r.text.startsWith("    ! @fix"))!;
  expect(fixRow).toMatchObject({ pane: fix.id, instance: panes.find((p) => p.id === fix.id).instance, tone: "warn" });

  const flipped = await s.modisa("plugin", "run", s.plugin, "order");
  expect(JSON.parse(flipped.stdout)).toEqual({ order: "recent" });
  await s.until("the recent order", async () => (await texts()).some((x) => x.includes("shop/shop-fix")));
  await s.modisa("plugin", "run", s.plugin, "order"); // back to grouped for the next test
}, 90_000);

test("an agent that exits leaves the radar", async () => {
  const gone = await agent("gone", repo);
  await gone.to("working");
  await s.until("it shows", async () => (await texts()).some((x) => x.includes("@gone")));
  await s.modisa("pane", "close", gone.id);
  await s.until("it's gone", async () => !(await texts()).some((x) => x.includes("@gone")));
}, 60_000);
