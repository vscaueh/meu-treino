const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "meu-treino-test-"));
process.env.DATA_DIR = directory;
const { server, db } = require("../server");
let base;
let cookie;
async function request(route, method = "GET", data, session = cookie) {
  const response = await fetch(base + "/api" + route, {
    method,
    headers: { ...(data ? { "Content-Type": "application/json" } : {}), ...(session ? { Cookie: session } : {}) },
    body: data ? JSON.stringify(data) : undefined
  });
  return { status: response.status, data: await response.json(), cookie: response.headers.get("set-cookie")?.split(";")[0] };
}
before(async () => {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise(resolve => server.close(resolve));
  db.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

test("cadastro, login e proteção de rotas", async () => {
  assert.equal((await request("/exercises")).status, 401);
  assert.equal((await request("/register", "POST", { email: "ana@example.com", password: "senha1234" })).status, 201);
  assert.equal((await request("/register", "POST", { email: "ana@example.com", password: "senha1234" })).status, 409);
  assert.equal((await request("/login", "POST", { email: "ana@example.com", password: "errada" })).status, 401);
  const login = await request("/login", "POST", { email: "ana@example.com", password: "senha1234" });
  assert.equal(login.status, 200);
  cookie = login.cookie;
  assert.equal((await request("/me")).data.email, "ana@example.com");
});

test("exercícios, ficha, treino e meta aparecem no histórico", async () => {
  const exercise = await request("/exercises", "POST", { name: "Agachamento", muscleGroup: "Pernas" });
  assert.equal(exercise.status, 201);
  const plan = await request("/plans", "POST", { name: "Treino A" });
  assert.equal(plan.status, 201);
  assert.equal((await request(`/plans/${plan.data.id}/exercises`, "POST", { exerciseId: exercise.data.id })).status, 201);
  const workout = await request("/workouts", "POST", { planId: plan.data.id, performedOn: "2026-11-10", notes: "Bom treino", entries: [{ exerciseId: exercise.data.id, sets: 3, reps: 10, weight: 40 }] });
  assert.equal(workout.status, 201);
  assert.equal((await request("/workouts")).data[0].entries[0].weight, 40);
  assert.equal((await request(`/workouts/${workout.data.id}`, "PUT", { performedOn: "2026-11-11", notes: "Carga maior", entries: [{ exerciseId: exercise.data.id, sets: 4, reps: 8, weight: 45 }] })).status, 200);
  assert.equal((await request("/workouts")).data[0].entries[0].weight, 45);
  const goal = await request("/goals", "POST", { description: "Treinar 3 vezes", targetDate: "2026-12-01" });
  assert.equal(goal.status, 201);
  assert.equal((await request(`/goals/${goal.data.id}`, "PATCH", { completed: true })).status, 200);
  assert.equal((await request("/goals")).data[0].completed, 1);
});

test("validação e isolamento entre usuários", async () => {
  assert.equal((await request("/exercises", "POST", { name: "", muscleGroup: "Pernas" })).status, 400);
  assert.equal((await request("/register", "POST", { email: "bia@example.com", password: "senha5678" })).status, 201);
  const other = await request("/login", "POST", { email: "bia@example.com", password: "senha5678" });
  assert.deepEqual((await request("/exercises", "GET", undefined, other.cookie)).data, []);
  assert.equal((await request("/plans/1/exercises", "GET", undefined, other.cookie)).status, 404);
  assert.equal((await request("/logout", "POST")).status, 200);
  assert.equal((await request("/me")).status, 401);
});

