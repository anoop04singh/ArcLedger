import { createPool, projectPending } from "@arcledger/database";
const pool = createPool(),
  db = await pool.connect();
try {
  console.log(await projectPending(db, 100));
} finally {
  db.release();
  await pool.end();
}
