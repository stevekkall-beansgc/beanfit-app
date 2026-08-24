// D1 data access. All statements prepared per call — D1 caches fine at this scale.

export function createStore(db) {
  const users = {
    async byEmail(email) {
      return db.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
    },
    async byId(id) {
      return db.prepare("SELECT * FROM users WHERE id = ?").bind(id).first();
    },
    async create(id, email, pwHash) {
      return db.prepare("INSERT INTO users (id, email, pw_hash) VALUES (?, ?, ?)")
        .bind(id, email, pwHash).run();
    },
    // Atomic user+identity creation: D1 batch = implicit transaction, so a
    // passwordless account can never exist without its identity row.
    async createWithIdentity(user, identity) {
      return db.batch([
        db.prepare("INSERT INTO users (id, email, pw_hash) VALUES (?, ?, ?)")
          .bind(user.id, user.email, user.pwHash),
        db.prepare(
          "INSERT INTO user_identities (provider, provider_uid, user_id, email_at_link) VALUES (?, ?, ?, ?)"
        ).bind(identity.provider, identity.providerUid, identity.userId, identity.emailAtLink),
      ]);
    },
  };

  const identities = {
    async find(provider, providerUid) {
      return db.prepare(
        "SELECT i.*, u.email AS user_email FROM user_identities i JOIN users u ON u.id = i.user_id WHERE provider = ? AND provider_uid = ?"
      ).bind(provider, providerUid).first();
    },
    async create(provider, providerUid, userId, emailAtLink) {
      return db.prepare(
        "INSERT INTO user_identities (provider, provider_uid, user_id, email_at_link) VALUES (?, ?, ?, ?)"
      ).bind(provider, providerUid, userId, emailAtLink).run();
    },
  };

  const sessions = {
    async create(tokenHash, userId, expiresAtUnix) {
      return db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
        .bind(tokenHash, userId, expiresAtUnix).run();
    },
    async valid(tokenHash, nowUnix) {
      return db.prepare(
        "SELECT s.user_id AS user_id, u.email AS email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?"
      ).bind(tokenHash, nowUnix).first();
    },
    async destroy(tokenHash) {
      return db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
    },
  };

  const devices = {
    async createPending(d) {
      return db.prepare(`INSERT INTO devices
        (id, label, pair_code, pair_id, pair_expires_at,
         os, arch, backend, chip, family, variant,
         ram_gib, metal_cap_gib, model_budget_gib, mem_bandwidth_gbs, bw_source)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        d.id, d.label, d.pair_code, d.pair_id, d.pair_expires_at,
        d.os, d.arch, d.backend, d.chip, d.family, d.variant,
        d.ram_gib, d.metal_cap_gib, d.model_budget_gib, d.mem_bandwidth_gbs, d.bw_source,
      ).run();
    },
    async byPairId(pairId) {
      return db.prepare("SELECT * FROM devices WHERE pair_id = ?").bind(pairId).first();
    },
    async byPairCode(code) {
      return db.prepare("SELECT * FROM devices WHERE pair_code = ?").bind(code).first();
    },
    // The whole pairing-liveness rule in one place: pending AND not expired.
    // IS NOT NULL matters — JS callers treated a missing expiry as expired,
    // so SQL must not make such rows immortal.
    async pendingByCode(code, nowUnix) {
      return db.prepare(
        "SELECT * FROM devices WHERE pair_code = ? AND status = 'pending'" +
        " AND pair_expires_at IS NOT NULL AND pair_expires_at > ?"
      ).bind(code, nowUnix).first();
    },
    async listForUser(userId) {
      const { results } = await db.prepare(
        "SELECT id, label, chip, ram_gib, model_budget_gib, bw_source, status, approved_at, created_at FROM devices WHERE user_id = ? AND status != 'pending' ORDER BY created_at DESC"
      ).bind(userId).all();
      return results ?? [];
    },
    async getForUser(id, userId) {
      return db.prepare("SELECT * FROM devices WHERE id = ? AND user_id = ?")
        .bind(id, userId).first();
    },
    // Single guarded transition: claim + token land atomically, so the CLI
    // can never poll an approved row whose token has not been written yet.
    async approve(deviceId, userId, tokenHash, token) {
      return db.prepare(
        "UPDATE devices SET user_id = ?, status = 'approved', approved_at = datetime('now')," +
        " device_token_hash = ?, device_token = ? WHERE id = ? AND status = 'pending'"
      ).bind(userId, tokenHash, token, deviceId).run();
    },
    async denyPending(deviceId) {
      return db.prepare("UPDATE devices SET status = 'denied' WHERE id = ? AND status = 'pending'")
        .bind(deviceId).run();
    },
    async setStack(deviceId, stackJson) {
      return db.prepare("UPDATE devices SET stack_json = ? WHERE id = ?")
        .bind(stackJson, deviceId).run();
    },
  };

  const recommendations = {
    async upsert(deviceId, useCase, engineVersion, payloadJson) {
      return db.prepare(`INSERT INTO recommendations (device_id, use_case, engine_version, payload_json)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(device_id) DO UPDATE SET use_case=excluded.use_case,
          engine_version=excluded.engine_version, payload_json=excluded.payload_json,
          generated_at=datetime('now')`).bind(deviceId, useCase, engineVersion, payloadJson).run();
    },
    async forDevice(deviceId) {
      return db.prepare("SELECT * FROM recommendations WHERE device_id = ?").bind(deviceId).first();
    },
  };

  const catalog = {
    async upsert(m) {
      return db.prepare(`INSERT INTO catalog_models
        (ollama_tag, name, params_b, mem_q4, mem_q8, kv32k, qual_coding, qual_reasoning, qual_chat, mlx_repo)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(ollama_tag) DO UPDATE SET name=excluded.name, params_b=excluded.params_b,
          mem_q4=excluded.mem_q4, mem_q8=excluded.mem_q8, kv32k=excluded.kv32k,
          qual_coding=excluded.qual_coding, qual_reasoning=excluded.qual_reasoning,
          qual_chat=excluded.qual_chat, mlx_repo=excluded.mlx_repo`).bind(
        m.ollama_tag, m.name, m.params_b, m.mem_q4, m.mem_q8, m.kv32k,
        m.qual_coding, m.qual_reasoning, m.qual_chat, m.mlx_repo).run();
    },
    async active() {
      const { results } = await db.prepare(
        "SELECT * FROM catalog_models WHERE active = 1").all();
      return results ?? [];
    },
  };

  return { users, sessions, identities, devices, recommendations, catalog };
}
