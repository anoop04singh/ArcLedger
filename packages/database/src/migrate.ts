import { createPool, migrate } from "./index.js";
const pool = createPool();
try {
  await migrate(pool);
  console.log("Database schema ready.");
} finally {
  await pool.end();
}
