// radar: every agent in the session at a glance, in the sidebar: its mark, its state and the task it's on, grouped by
// the repository it works in (worktrees under their repository), the one that needs you on top, idle ones fading.
// Read AGENTS.md before changing it.
import { runPlugin, type Pane } from "./modisa-plugin";
import { layout, title, type Agent, type Order } from "./radar";

// The repository a directory is in: its main checkout's name, and the worktree's when it's a linked one. Outside a
// repository, the directory's own name. Cached a minute per directory: a cwd rarely moves between repositories.
const repos = new Map<string, { at: number; project: string; worktree?: string }>();
async function where(cwd: string) {
  const hit = repos.get(cwd);
  if (hit && Date.now() - hit.at < 60_000) return hit;
  const out = await Bun.$`git -C ${cwd} rev-parse --path-format=absolute --show-toplevel --git-common-dir`.quiet().nothrow();
  const [top, common] = out.exitCode === 0 ? out.text().trim().split("\n") : [];
  const base = (p: string) => p.replace(/\/+$/, "").split("/").pop() || p;
  const root = common?.endsWith("/.git") ? common.slice(0, -"/.git".length) : top;
  const found = top && root
    ? { at: Date.now(), project: base(root), ...(top !== root && { worktree: base(top) }) }
    : { at: Date.now(), project: base(cwd) };
  repos.set(cwd, found);
  return found;
}

runPlugin(async (modisa) => {
  let order: Order = "grouped";
  const since = new Map<string, number>(); // pane instance → when its agent's state last changed
  let shown = "";

  async function draw() {
    const panes = (await modisa.request<Pane[]>("list")).filter((p) => p.agent && p.status === "running");
    const agents: Agent[] = await Promise.all(panes.map(async (p) => {
      const { project, worktree } = await where(p.cwd);
      return {
        pane: p.id, instance: p.instance, ...(p.name && { name: p.name }), harness: p.agent!.harness, title: p.terminalTitle ?? p.title ?? "",
        state: p.agent!.state, since: since.get(p.instance) ?? Date.now(), project, ...(worktree && { worktree }),
      };
    }));
    for (const a of agents) if (!since.has(a.instance)) since.set(a.instance, a.since);
    const next = agents.length ? { title: title(agents), rows: layout(agents, Date.now(), order) } : undefined;
    const key = JSON.stringify(next ?? null);
    if (key === shown) return; // modisa rate-limits updates: send only changes
    shown = key;
    if (next) await modisa.ui.sidebar(next.title, next.rows);
    else await modisa.ui.clearSidebar();
  }

  // Draws are coalesced: a burst of events is one redraw, and a draw never overlaps the last one.
  let pending: Promise<void> | undefined;
  let again = false;
  const redraw = () => {
    if (pending) return void (again = true);
    pending = Bun.sleep(150).then(draw).catch((e) => console.error(`radar: ${e.message ?? e}`)).finally(() => {
      pending = undefined;
      if (again) {
        again = false;
        redraw();
      }
    });
  };

  await modisa.hello({
    order: () => {
      order = order === "grouped" ? "recent" : "grouped";
      redraw();
      return { order };
    },
    status: () => ({ order, tracking: since.size }),
  });

  await modisa.subscribe({
    onSnapshot: () => redraw(), // what's already true: those agents' ages count from now
    onEvent: (event) => {
      if (event.type === "agent.state" && event.instance) since.set(event.instance, event.at);
      if (event.type === "process.exited" && event.instance) since.delete(event.instance);
      if (event.type === "agent.state" || event.type === "pane.created" || event.type === "process.exited") redraw();
    },
  });
  setInterval(redraw, 30_000); // ages tick on, and a cwd moves without an event
  console.log("radar: watching");
});
