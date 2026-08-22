'use strict';

const { mkdtempSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');

const Database = require('@notera/sqlcipher');

function fail(message) {
  throw new Error(message);
}

function keyHex(seed) {
  return Buffer.from(
    Array.from({ length: 32 }, (_, index) => (seed + index) % 256),
  ).toString('hex');
}

function applyKey(database, hex) {
  database.pragma(`key = "x'${hex}'"`);
}

function assertEncryptedHeader(filePath) {
  const header = readFileSync(filePath).subarray(0, 16).toString('utf8');
  if (header === 'SQLite format 3\0') {
    fail('database header is not encrypted');
  }
}

function assertWrongKeyRejected(filePath) {
  const database = new Database(filePath, { fileMustExist: true });
  try {
    applyKey(database, keyHex(91));
    database.prepare('SELECT count(*) FROM sqlite_master').get();
    fail('incorrect database key was accepted');
  } catch (error) {
    if (error.message === 'incorrect database key was accepted') {
      throw error;
    }
  } finally {
    database.close();
  }
}

function assertPlainSqliteRejected(filePath) {
  let database;
  try {
    database = new DatabaseSync(filePath, { readOnly: true });
    database.prepare('SELECT count(*) FROM sqlite_master').get();
    fail('plain SQLite opened the encrypted database');
  } catch (error) {
    if (error.message === 'plain SQLite opened the encrypted database') {
      throw error;
    }
  } finally {
    database?.close();
  }
}

function runProbe(runtimeName) {
  const root = mkdtempSync(join(tmpdir(), 'notera-sqlcipher-runtime-'));
  const filePath = join(root, 'vault.db');
  try {
    const database = new Database(filePath);
    applyKey(database, keyHex(17));
    database.pragma('journal_mode = WAL');
    database.exec(
      "CREATE TABLE probe(value TEXT NOT NULL);" +
        "INSERT INTO probe VALUES ('encrypted');" +
        "CREATE VIRTUAL TABLE probe_fts USING fts5(value, tokenize='trigram');" +
        "INSERT INTO probe_fts VALUES ('Notera encrypted note')",
    );
    const match = database
      .prepare('SELECT value FROM probe_fts WHERE probe_fts MATCH ?')
      .get('Not');
    if (match?.value !== 'Notera encrypted note') {
      fail('FTS5 trigram query failed');
    }
    database.pragma('wal_checkpoint(TRUNCATE)');
    database.close();

    assertEncryptedHeader(filePath);
    assertWrongKeyRejected(filePath);
    assertPlainSqliteRejected(filePath);
    process.stdout.write(`${runtimeName}: SQLCipher encryption and FTS5 trigram OK\n`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

if (process.versions.electron && process.env.NOTERA_SQLCIPHER_NODE_CHILD !== '1') {
  const environment = { ...process.env, NOTERA_SQLCIPHER_NODE_CHILD: '1' };
  delete environment.ELECTRON_RUN_AS_NODE;
  const nodeResult = spawnSync('node', [__filename], {
    encoding: 'utf8',
    env: environment,
  });
  process.stdout.write(nodeResult.stdout);
  process.stderr.write(nodeResult.stderr);
  if (nodeResult.status !== 0) {
    process.exitCode = nodeResult.status ?? 1;
  } else {
    runProbe('Electron');
  }
} else {
  runProbe('Node');
}
