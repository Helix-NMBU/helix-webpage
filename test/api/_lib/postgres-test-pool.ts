import pg from "pg";

/** Keep the test database alive until the server connections have actually ended. */
export function createPostgresTestPool(config: pg.PoolConfig): { pool: pg.Pool; close: () => Promise<void> } {
  const pool = new pg.Pool(config);
  const disconnected: Promise<void>[] = [];
  // Register before the first query. This also tracks clients that end normally
  // before teardown, so close never waits for an event that has already fired.
  pool.on("connect", client => {
    disconnected.push(new Promise<void>(resolve => client.once("end", resolve)));
  });
  return {
    pool,
    async close() {
      // pg-pool can resolve end() after removing clients from its list but before
      // their asynchronous end callbacks finish. Await the real end events too.
      await pool.end();
      await Promise.all(disconnected);
    },
  };
}
