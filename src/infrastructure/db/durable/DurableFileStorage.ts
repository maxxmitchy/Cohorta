import * as fs from 'fs';
import * as path from 'path';

/**
 * Crash-safe, atomic file storage utility.
 * Writes to a temporary file first and atomically renames to the destination file.
 * Chains write operations in a serialized queue with error isolation to prevent deadlock/queue-poisoning.
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
    return this.readDirectly();
  }

  public async write(data: T): Promise<void> {
    this.inMemoryCache = data;

    // Chain onto the write queue with error-catching to prevent permanent queue poisoning
    const queuedTask = this.writeQueue
      .catch(() => {}) // absorb previous failure so future writes continue
      .then(() => this.writeDirectly(data));

    this.writeQueue = queuedTask.catch(() => {});
    return queuedTask;
  }

  /**
   * Performs an atomic read-modify-write operation within the serialized queue,
   * guaranteeing that concurrent callers cannot read stale data or overwrite each other.
   */
  public async mutate<R>(mutator: (data: T) => Promise<R> | R): Promise<R> {
    let result!: R;

    const executeMutation = async () => {
      const data = await this.readDirectly();
      result = await mutator(data);
      this.inMemoryCache = data;
      await this.writeDirectly(data);
    };

    const queuedTask = this.writeQueue
      .catch(() => {})
      .then(executeMutation);

    this.writeQueue = queuedTask.catch(() => {});
    await queuedTask;
    return result;
  }

  private async readDirectly(): Promise<T> {
    try {
      if (!fs.existsSync(this.filePath)) {
        const defaultData = this.defaultDataFactory();
        await this.writeDirectly(defaultData);
        this.inMemoryCache = defaultData;
        return defaultData;
      }

      const raw = await fs.promises.readFile(this.filePath, 'utf-8');
      if (!raw || !raw.trim()) {
        const defaultData = this.defaultDataFactory();
        await this.writeDirectly(defaultData);
        this.inMemoryCache = defaultData;
        return defaultData;
      }

      const parsed = JSON.parse(raw, this.dateReviver) as T;
      this.inMemoryCache = parsed;
      return parsed;
    } catch (err) {
      console.error(`[DurableFileStorage] Read error on ${this.filePath}, falling back to default:`, err);
      const defaultData = this.defaultDataFactory();
      this.inMemoryCache = defaultData;
      return defaultData;
    }
  }

  private async writeDirectly(data: T): Promise<void> {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      await fs.promises.mkdir(dir, { recursive: true });
    }

    const tempPath = `${this.filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
    const serialized = JSON.stringify(data, null, 2);

    await fs.promises.writeFile(tempPath, serialized, 'utf-8');
    await fs.promises.rename(tempPath, this.filePath);
  }

  public invalidateCache(): void {
    this.inMemoryCache = null;
  }

  private dateReviver(_key: string, value: unknown): unknown {
    if (typeof value === 'string') {
      // Check if ISO 8601 date string (with optional ms and Z or timezone offset)
      const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
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
