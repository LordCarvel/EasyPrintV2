import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const DB_PATH = process.env.ROUTING_DB_PATH || path.join(process.cwd(), 'server', 'data', 'routing.sqlite');

export const nowIso = () => new Date().toISOString();

export const createId = (prefix = 'id') =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export const openDatabase = () => {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA foreign_keys = ON;');
  return db;
};

export const migrate = (db) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS stores (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      city TEXT NOT NULL DEFAULT '',
      service_areas TEXT NOT NULL DEFAULT '[]',
      review_areas TEXT NOT NULL DEFAULT '[]',
      receives_orders INTEGER NOT NULL DEFAULT 1,
      auto_print INTEGER NOT NULL DEFAULT 0,
      username TEXT,
      password_hash TEXT,
      password_salt TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS store_connections (
      id TEXT PRIMARY KEY,
      source_store_id TEXT NOT NULL,
      target_store_id TEXT NOT NULL,
      can_send_orders INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(source_store_id, target_store_id),
      FOREIGN KEY(source_store_id) REFERENCES stores(id) ON DELETE CASCADE,
      FOREIGN KEY(target_store_id) REFERENCES stores(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      order_number TEXT NOT NULL DEFAULT '',
      customer_name TEXT NOT NULL DEFAULT '',
      source_store_id TEXT NOT NULL,
      target_store_id TEXT NOT NULL,
      raw_text TEXT NOT NULL,
      parsed_data TEXT NOT NULL,
      route_result TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      viewed_at TEXT,
      printed_at TEXT,
      canceled_at TEXT,
      FOREIGN KEY(source_store_id) REFERENCES stores(id),
      FOREIGN KEY(target_store_id) REFERENCES stores(id)
    );

    CREATE TABLE IF NOT EXISTS order_events (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS store_sessions (
      token TEXT PRIMARY KEY,
      store_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT,
      FOREIGN KEY(store_id) REFERENCES stores(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS store_settings (
      store_id TEXT PRIMARY KEY,
      keywords TEXT NOT NULL DEFAULT '[]',
      catalogs TEXT NOT NULL DEFAULT '[]',
      print_template TEXT NOT NULL DEFAULT '{}',
      cash_orders TEXT NOT NULL DEFAULT '[]',
      cash_processed TEXT NOT NULL DEFAULT '[]',
      delivery_board_state TEXT NOT NULL DEFAULT '{}',
      finally_storage_state TEXT NOT NULL DEFAULT '{}',
      finally_storage_preview TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL,
      FOREIGN KEY(store_id) REFERENCES stores(id) ON DELETE CASCADE
    );

  `);

  ensureColumn(db, 'stores', 'username', 'TEXT');
  ensureColumn(db, 'stores', 'password_hash', 'TEXT');
  ensureColumn(db, 'stores', 'password_salt', 'TEXT');
  ensureColumn(db, 'store_settings', 'delivery_board_state', "TEXT NOT NULL DEFAULT '{}'");
  ensureColumn(db, 'store_settings', 'finally_storage_state', "TEXT NOT NULL DEFAULT '{}'");
  ensureColumn(db, 'store_settings', 'finally_storage_preview', "TEXT NOT NULL DEFAULT '{}'");

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS stores_username_unique
      ON stores(username)
      WHERE username IS NOT NULL;
  `);
};

const ensureColumn = (db, tableName, columnName, definition) => {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  const exists = columns.some((column) => column.name === columnName);
  if (!exists) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition};`);
  }
};

export const encodeJson = (value) => JSON.stringify(value ?? null);

export const decodeJson = (value, fallback) => {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};
