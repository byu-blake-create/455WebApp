import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const DB_PATH = path.join(process.cwd(), "shop.db");

function createDatabase() {
  if (!fs.existsSync(DB_PATH)) {
    throw new Error(`Missing database file at ${DB_PATH}`);
  }

  const db = new Database(DB_PATH, { fileMustExist: true });
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

let dbInstance;

function getDb() {
  if (!dbInstance) {
    dbInstance = createDatabase();
  }

  return dbInstance;
}

export function all(sql, params = []) {
  const statement = getDb().prepare(sql);
  return Array.isArray(params) ? statement.all(...params) : statement.all(params);
}

export function get(sql, params = []) {
  const statement = getDb().prepare(sql);
  return Array.isArray(params) ? statement.get(...params) : statement.get(params);
}

export function run(sql, params = []) {
  const statement = getDb().prepare(sql);
  return Array.isArray(params) ? statement.run(...params) : statement.run(params);
}

export function transaction(callback) {
  return getDb().transaction(callback)();
}

export function tableExists(tableName) {
  return Boolean(
    get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", [tableName])
  );
}

export function getTableColumns(tableName) {
  return all(`PRAGMA table_info(${tableName})`);
}

export function getSchemaDetails() {
  const tables = all("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name");
  return tables.map(({ name }) => ({
    name,
    columns: getTableColumns(name)
  }));
}
