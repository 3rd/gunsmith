import { writeFile } from "node:fs/promises";
import { z } from "zod";
import cli from "../../index";

const interrupt = process.env.FIXTURE_INTERRUPT === "abort" ? "abort" : "exit";
const app = cli.create("fixture");

app.command("wait", {
  interrupt,
  args: z.object({ markerPath: z.string() }),
  run: async ({ args, signal, reportProgress }) => {
    const aborted = new Promise<void>((resolve) => {
      signal.addEventListener("abort", () => resolve(), { once: true });
    });
    reportProgress({ progress: 1, message: "waiting" });
    await aborted;
    await writeFile(args.markerPath, "cleaned up");

    return { outcome: "cancelled" };
  },
});

await app.serve(undefined, { exit: (code) => process.exit(code) });
