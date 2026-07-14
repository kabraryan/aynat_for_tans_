import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/**
 * File storage behind an interface so the later S3 move (deploy phase) is a
 * new implementation, not a refactor. Keys are opaque to business logic.
 */
export interface FileStorage {
  put(bytes: Buffer, opts: { originalName: string }): Promise<string>; // -> key
  get(key: string): Promise<Buffer>;
  /** Absolute filesystem path when the backing store is local disk; used by
   *  the agent extraction backend to hand Claude a readable path. */
  localPath?(key: string): string;
}

const STORAGE_DIR = path.resolve(process.env.STORAGE_DIR || "./storage");

class LocalDiskStorage implements FileStorage {
  async put(bytes: Buffer, opts: { originalName: string }): Promise<string> {
    const ext = path.extname(opts.originalName).toLowerCase() || "";
    const key = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}${ext}`;
    const filePath = path.join(STORAGE_DIR, key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, bytes);
    return key;
  }

  async get(key: string): Promise<Buffer> {
    return fs.readFile(path.join(STORAGE_DIR, key));
  }

  localPath(key: string): string {
    return path.join(STORAGE_DIR, key);
  }
}

export const storage: FileStorage = new LocalDiskStorage();
