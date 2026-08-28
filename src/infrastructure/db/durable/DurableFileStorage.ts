import * as fs from 'fs';
import * as path from 'path';

/**
 * Crash-safe, atomic file storage utility.
 * Writes to a temporary file first and atomically renames to the destination file.
 */
export class DurableFileStorage<T> {
  private inMemoryCache: T | null = null;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly filePath: string,
    private readonly defaultDataFactory: () => T
  ) {}

  public getFilePath(): string {
    return this.filePath;
  }

  public async read(): Promise<T> {
    if (this.inMemoryCache !== null) {
      return this.inMemoryCache;
    }

    try {
      if (!fs.existsSync(this.filePath)) {
        const defaultData = this.defaultDataFactory();
        await this.write(defaultData);
        return defaultData;
      }

      const raw = await fs.promises.readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw, this.dateReviver) as T;
      this.inMemoryCache = parsed;
      return parsed;
    } catch {
      // If file read/parse fails, fallback to default
      const defaultData = this.defaultDataFactory();
      this.inMemoryCache = defaultData;
      return defaultData;
    }
  }

  public async write(data: T): Promise<void> {
    this.inMemoryCache = data;

    // Enqueue writes to avoid race conditions
    this.writeQueue = this.writeQueue.then(async () => {
      try {
        const dir = path.dirname(this.filePath);
        if (!fs.existsSync(dir)) {
          await fs.promises.mkdir(dir, { recursive: true });
        }

        const tempPath = `${this.filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
        const serialized = JSON.stringify(data, null, 2);

        await fs.promises.writeFile(tempPath, serialized, 'utf-8');
        await fs.promises.rename(tempPath, this.filePath);
      } catch (err) {
        console.error(`[DurableFileStorage] Failed to write file ${this.filePath}:`, err);
        throw err;
      }
    });

    return this.writeQueue;
  }

  public invalidateCache(): void {
    this.inMemoryCache = null;
  }

  private dateReviver(_key: string, value: unknown): unknown {
    if (typeof value === 'string') {
      // Check if ISO 8601 date string
      const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
      if (isoRegex.test(value)) {
        const d = new Date(value);
        if (!isNaN(d.getTime())) {
          return d;
        }
      }
    }
    return value;
  }
}
