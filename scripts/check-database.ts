import { createPool, databaseHealth } from "@arcledger/database";
const pool = createPool();
try {
  console.log(JSON.stringify(await databaseHealth(pool)));
} catch {
  console.error(
    "Database connection failed. Check the copied Session Pooler URL, password, network and CA certificate.",
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
