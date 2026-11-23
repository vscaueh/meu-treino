const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const dataDir = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const databaseFile = path.join(dataDir, "treinos.sqlite");

if (!fs.existsSync(databaseFile)) {
  console.error("Banco não encontrado. Inicie a aplicação uma vez com npm start.");
  process.exitCode = 1;
} else {
  const database = new DatabaseSync(databaseFile, { readOnly: true });
  try {
    const tables = database.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ).all();
    console.log("Banco SQLite: treinos.sqlite");
    console.log("Tabelas:");
    for (const { name } of tables) console.log(`- ${name}`);
    console.log(`${tables.length} tabelas encontradas.`);
  } finally {
    database.close();
  }
}
