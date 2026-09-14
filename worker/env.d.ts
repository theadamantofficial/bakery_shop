declare namespace Cloudflare {
  interface Env {
    // D1 is optional; getDb() reports a missing binding at runtime.
    DB?: D1Database;
  }
}
