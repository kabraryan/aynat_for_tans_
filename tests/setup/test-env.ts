import path from "node:path";
import os from "node:os";

// Runs before any test module is imported (vitest setupFiles): point the app
// at the throwaway test database and a temp storage dir, and force the
// zero-cost stub extraction backend.
process.env.DATABASE_URL = "postgresql://aynat:aynat@localhost:5432/aynat_test";
process.env.STORAGE_DIR = path.join(os.tmpdir(), "aynat-test-storage");
process.env.EXTRACTION_BACKEND = "stub";
