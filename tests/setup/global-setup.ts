import { execSync } from "node:child_process";
import { Client } from "pg";

const ADMIN_URL = "postgresql://aynat:aynat@localhost:5432/aynat";
const TEST_URL = "postgresql://aynat:aynat@localhost:5432/aynat_test";

/** Create the test database (once) and bring it to the current migration state. */
export default async function setup() {
  const client = new Client({ connectionString: ADMIN_URL });
  await client.connect();
  const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = 'aynat_test'");
  if (exists.rowCount === 0) {
    await client.query("CREATE DATABASE aynat_test");
  }
  await client.end();

  execSync("pnpm prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: TEST_URL },
    stdio: "pipe",
  });
}
