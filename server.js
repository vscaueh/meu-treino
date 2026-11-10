const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

const dataDir = process.env.DATA_DIR || (process.env.WEBSITE_SITE_NAME && process.env.HOME ? path.join(process.env.HOME, "site", "wwwroot", "App_Data", "meu-treino") : path.join(__dirname, "data"));
fs.mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(path.join(dataDir, "treinos.sqlite"));
db.exec(`
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, salt TEXT NOT NULL, password_hash TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS exercises (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), name TEXT NOT NULL, muscle_group TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS plans (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS plan_exercises (id INTEGER PRIMARY KEY, plan_id INTEGER NOT NULL REFERENCES plans(id), exercise_id INTEGER NOT NULL REFERENCES exercises(id), UNIQUE(plan_id, exercise_id));
CREATE TABLE IF NOT EXISTS workouts (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), plan_id INTEGER NOT NULL REFERENCES plans(id), performed_on TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS workout_entries (id INTEGER PRIMARY KEY, workout_id INTEGER NOT NULL REFERENCES workouts(id) ON DELETE CASCADE, exercise_id INTEGER NOT NULL REFERENCES exercises(id), sets INTEGER NOT NULL, reps INTEGER NOT NULL, weight REAL NOT NULL);
CREATE TABLE IF NOT EXISTS goals (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), description TEXT NOT NULL, target_date TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);
`);

function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(body);
}
function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}
function text(value, max = 120) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) fail("Texto obrigatório ou muito longo.");
  return value.trim();
}
function id(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) fail("Identificador inválido.");
  return number;
}
function date(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) fail("Data inválida.");
  return value;
}
function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}
function tokenHash(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}
function currentUser(req) {
  const cookie = req.headers.cookie || "";
  const token = cookie.split(";").map(x => x.trim()).find(x => x.startsWith("session="))?.slice(8);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) fail("Faça login para continuar.", 401);
  const user = db.prepare("SELECT users.id, users.email FROM users JOIN sessions ON sessions.user_id = users.id WHERE sessions.token_hash = ? AND sessions.expires_at > ?").get(tokenHash(token), Date.now());
  if (!user) fail("Sessão expirada. Entre novamente.", 401);
  return user;
}
async function readBody(req) {
  if (!req.headers["content-type"]?.startsWith("application/json")) fail("Envie JSON.", 415);
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 20000) fail("Dados muito grandes.", 413);
  }
  let body;
  try { body = JSON.parse(raw); } catch { fail("JSON inválido."); }
  if (!body || typeof body !== "object" || Array.isArray(body)) fail("Envie um objeto JSON.");
  return body;
}
function own(table, itemId, userId) {
  const row = db.prepare(`SELECT * FROM ${table} WHERE id = ? AND user_id = ?`).get(itemId, userId);
  if (!row) fail("Registro não encontrado.", 404);
  return row;
}
function list(query, userId) { return db.prepare(query).all(userId); }

async function handleApi(req, res, route) {
  const method = req.method;
  if (route === "/api/register" && method === "POST") {
    const body = await readBody(req);
    const email = text(body.email, 254).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("E-mail inválido.");
    if (typeof body.password !== "string" || body.password.length < 8 || body.password.length > 128) fail("A senha deve ter entre 8 e 128 caracteres.");
    const salt = crypto.randomBytes(16).toString("hex");
    try { db.prepare("INSERT INTO users (email, salt, password_hash) VALUES (?, ?, ?)").run(email, salt, hashPassword(body.password, salt)); }
    catch { fail("E-mail já cadastrado.", 409); }
    return json(res, 201, { message: "Conta criada. Faça login." });
  }
  if (route === "/api/login" && method === "POST") {
    const body = await readBody(req);
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
    if (!user || typeof body.password !== "string" || hashPassword(body.password, user.salt) !== user.password_hash) fail("Credenciais inválidas.", 401);
    const token = crypto.randomBytes(32).toString("hex");
    db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(tokenHash(token), user.id, Date.now() + 7 * 86400000);
    res.setHeader("Set-Cookie", `session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
    return json(res, 200, { id: user.id, email: user.email });
  }
  if (route === "/api/logout" && method === "POST") {
    const user = currentUser(req);
    const token = (req.headers.cookie || "").match(/(?:^|;\s*)session=([a-f0-9]{64})/)?.[1];
    if (token) db.prepare("DELETE FROM sessions WHERE token_hash = ? AND user_id = ?").run(tokenHash(token), user.id);
    res.setHeader("Set-Cookie", "session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
    return json(res, 200, { message: "Sessão encerrada." });
  }
  const user = currentUser(req);
  if (route === "/api/me" && method === "GET") return json(res, 200, user);
  if (route === "/api/exercises" && method === "GET") return json(res, 200, list("SELECT id, name, muscle_group FROM exercises WHERE user_id = ? ORDER BY name", user.id));
  if (route === "/api/exercises" && method === "POST") {
    const body = await readBody(req);
    const result = db.prepare("INSERT INTO exercises (user_id, name, muscle_group) VALUES (?, ?, ?)").run(user.id, text(body.name), text(body.muscleGroup));
    return json(res, 201, { id: Number(result.lastInsertRowid) });
  }
  if (route === "/api/plans" && method === "GET") return json(res, 200, list("SELECT id, name FROM plans WHERE user_id = ? ORDER BY id DESC", user.id));
  if (route === "/api/plans" && method === "POST") {
    const body = await readBody(req);
    const result = db.prepare("INSERT INTO plans (user_id, name) VALUES (?, ?)").run(user.id, text(body.name));
    return json(res, 201, { id: Number(result.lastInsertRowid) });
  }
  const planMatch = route.match(/^\/api\/plans\/(\d+)\/exercises$/);
  if (planMatch && method === "GET") {
    const planId = id(planMatch[1]);
    own("plans", planId, user.id);
    return json(res, 200, db.prepare("SELECT e.id, e.name, e.muscle_group FROM plan_exercises pe JOIN exercises e ON e.id = pe.exercise_id WHERE pe.plan_id = ? ORDER BY pe.id").all(planId));
  }
  if (planMatch && method === "POST") {
    const planId = id(planMatch[1]);
    own("plans", planId, user.id);
    const body = await readBody(req);
    const exerciseId = id(body.exerciseId);
    own("exercises", exerciseId, user.id);
    try { db.prepare("INSERT INTO plan_exercises (plan_id, exercise_id) VALUES (?, ?)").run(planId, exerciseId); }
    catch { fail("Exercício já está na ficha.", 409); }
    return json(res, 201, { message: "Exercício adicionado." });
  }
  if (route === "/api/workouts" && method === "GET") {
    const workouts = list("SELECT w.id, w.plan_id, p.name AS plan_name, w.performed_on, w.notes FROM workouts w JOIN plans p ON p.id = w.plan_id WHERE w.user_id = ? ORDER BY w.performed_on DESC, w.id DESC LIMIT 100", user.id);
    for (const workout of workouts) workout.entries = db.prepare("SELECT we.exercise_id, e.name, we.sets, we.reps, we.weight FROM workout_entries we JOIN exercises e ON e.id = we.exercise_id WHERE we.workout_id = ?").all(workout.id);
    return json(res, 200, workouts);
  }
  if (route === "/api/workouts" && method === "POST") {
    const body = await readBody(req);
    const planId = id(body.planId);
    own("plans", planId, user.id);
    const entries = validateEntries(body.entries, planId);
    const day = date(body.performedOn);
    const notes = typeof body.notes === "string" ? body.notes.slice(0, 500) : "";
    db.exec("BEGIN");
    try {
      const result = db.prepare("INSERT INTO workouts (user_id, plan_id, performed_on, notes) VALUES (?, ?, ?, ?)").run(user.id, planId, day, notes);
      const workoutId = Number(result.lastInsertRowid);
      insertEntries(workoutId, entries);
      db.exec("COMMIT");
      return json(res, 201, { id: workoutId });
    } catch (error) { db.exec("ROLLBACK"); throw error; }
  }
  const workoutMatch = route.match(/^\/api\/workouts\/(\d+)$/);
  if (workoutMatch && method === "PUT") {
    const workout = own("workouts", id(workoutMatch[1]), user.id);
    const body = await readBody(req);
    const entries = validateEntries(body.entries, workout.plan_id);
    const day = date(body.performedOn);
    const notes = typeof body.notes === "string" ? body.notes.slice(0, 500) : "";
    db.exec("BEGIN");
    try {
      db.prepare("UPDATE workouts SET performed_on = ?, notes = ? WHERE id = ?").run(day, notes, workout.id);
      db.prepare("DELETE FROM workout_entries WHERE workout_id = ?").run(workout.id);
      insertEntries(workout.id, entries);
      db.exec("COMMIT");
      return json(res, 200, { message: "Treino atualizado." });
    } catch (error) { db.exec("ROLLBACK"); throw error; }
  }
  if (route === "/api/goals" && method === "GET") return json(res, 200, list("SELECT id, description, target_date, completed FROM goals WHERE user_id = ? ORDER BY target_date", user.id));
  if (route === "/api/goals" && method === "POST") {
    const body = await readBody(req);
    const result = db.prepare("INSERT INTO goals (user_id, description, target_date) VALUES (?, ?, ?)").run(user.id, text(body.description, 200), date(body.targetDate));
    return json(res, 201, { id: Number(result.lastInsertRowid) });
  }
  const goalMatch = route.match(/^\/api\/goals\/(\d+)$/);
  if (goalMatch && method === "PATCH") {
    const goal = own("goals", id(goalMatch[1]), user.id);
    const body = await readBody(req);
    if (typeof body.completed !== "boolean") fail("Informe se a meta foi concluída.");
    db.prepare("UPDATE goals SET completed = ? WHERE id = ?").run(body.completed ? 1 : 0, goal.id);
    return json(res, 200, { message: "Meta atualizada." });
  }
  fail("Rota não encontrada.", 404);
}
function validateEntries(entries, planId) {
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > 30) fail("Informe de 1 a 30 exercícios.");
  const allowed = new Set(db.prepare("SELECT exercise_id FROM plan_exercises WHERE plan_id = ?").all(planId).map(row => row.exercise_id));
  return entries.map(entry => {
    const exerciseId = id(entry.exerciseId);
    if (!allowed.has(exerciseId)) fail("Exercício não pertence à ficha.");
    const sets = Number(entry.sets);
    const reps = Number(entry.reps);
    const weight = Number(entry.weight);
    if (!Number.isSafeInteger(sets) || sets < 1 || sets > 20 || !Number.isSafeInteger(reps) || reps < 1 || reps > 100 || !Number.isFinite(weight) || weight < 0 || weight > 1000) fail("Séries, repetições ou carga inválidas.");
    return { exerciseId, sets, reps, weight };
  });
}
function insertEntries(workoutId, entries) {
  const insert = db.prepare("INSERT INTO workout_entries (workout_id, exercise_id, sets, reps, weight) VALUES (?, ?, ?, ?, ?)");
  for (const entry of entries) insert.run(workoutId, entry.exerciseId, entry.sets, entry.reps, entry.weight);
}
const files = { "/": ["index.html", "text/html"], "/app.js": ["app.js", "application/javascript"], "/style.css": ["style.css", "text/css"] };
const server = http.createServer(async (req, res) => {
  try {
    const route = new URL(req.url, "http://localhost").pathname;
    if (route.startsWith("/api/")) return await handleApi(req, res, route);
    if (req.method !== "GET" || !files[route]) fail("Página não encontrada.", 404);
    const [name, type] = files[route];
    res.writeHead(200, { "Content-Type": type + "; charset=utf-8", "X-Content-Type-Options": "nosniff" });
    fs.createReadStream(path.join(__dirname, "public", name)).pipe(res);
  } catch (error) {
    json(res, error.status || 500, { error: error.status ? error.message : "Erro interno do servidor." });
    if (!error.status) console.error(error);
  }
});
if (require.main === module) server.listen(Number(process.env.PORT) || 3000, () => console.log("Meu Treino disponível na porta " + (process.env.PORT || 3000)));
module.exports = { server, db };

