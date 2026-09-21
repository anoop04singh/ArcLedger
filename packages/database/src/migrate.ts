import { createPool, migrate } from "./index.js";
const pool = createPool(),
  db = await pool.connect();
try {
  await migrate(db);
  console.log("Database migrations applied.");
} finally {
  db.release();
  await pool.end();
}
