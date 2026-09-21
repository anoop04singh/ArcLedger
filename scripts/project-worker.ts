import {
  createPool,
  projectPending,
  databaseBytes,
  HISTORY_TRIGGER_BYTES,
} from "@arcledger/database";
import { readMode } from "@arcledger/arc-config";
import { setTimeout } from "node:timers/promises";
if (readMode() !== "mainnet")
  throw new Error("Projection worker requires ARCLEDGER_MODE=mainnet");
const pool = createPool(),
  controller = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => controller.abort());
pool.on("error", () =>
  console.error("Projection database disconnected; retrying."),
);
try {
  while (!controller.signal.aborted) {
    let db;
    const connectionError = () => {};
    let idle = true;
    try {
      db = await pool.connect();
      db.on("error", connectionError);
      if ((await databaseBytes(db)) >= HISTORY_TRIGGER_BYTES - 16_000_000)
        throw new Error("Waiting for storage retention");
      const result = await projectPending(db, 20);
      idle = result.projected === 0;
      if (result.projected || result.failed)
        console.log(JSON.stringify({ event: "ledger_projected", ...result }));
    } catch {
      console.error(
        "Projection unavailable; retrying without changing raw checkpoints.",
      );
    } finally {
      db?.removeListener("error", connectionError);
      db?.release(true);
    }
    if (idle && !controller.signal.aborted)
      await setTimeout(750, undefined, { signal: controller.signal }).catch(
        () => {},
      );
  }
} finally {
  await pool.end();
}
