#!/usr/bin/env node
import { z } from "zod";
import cli from "../../src/index";

const app = cli.create("work", { description: "Nested command tree example" });
const task = cli.command("task", { description: "Manage tasks" });

task.command("list", {
  alias: "ls",
  description: "List tasks",
  options: z.object({ state: z.enum(["open", "closed", "all"]).default("open") }),
  run: ({ options }) => {
    const tasks = [
      { id: 1, title: "write examples", state: "open" },
      { id: 2, title: "ship release", state: "closed" },
    ].filter((task) => options.state === "all" || task.state === options.state);

    for (const task of tasks) console.log(`#${task.id} ${task.title} (${task.state})`);
    return { tasks, state: options.state };
  },
});

task.command("close", {
  description: "Close a task",
  args: z.object({ id: z.coerce.number().describe("Task id") }),
  run: ({ args }) => {
    console.log(`closed #${args.id}`);
    return { id: args.id, closed: true };
  },
});

app.command(task);
app.serve();
