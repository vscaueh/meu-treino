const $ = selector => document.querySelector(selector);
const state = { exercises: [], plans: [], workouts: [], goals: [] };
let authMode = "login";
let editingWorkoutId = null;
const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

async function api(path, method = "GET", body) {
  const response = await fetch(`/api${path}`, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Algo deu errado.");
  return data;
}
function toast(message, error = false) {
  const element = $("#toast");
  element.textContent = message;
  element.className = `toast${error ? " error" : ""}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.add("hidden"), 4000);
}
function formData(form) { return Object.fromEntries(new FormData(form)); }
function showDashboard(user) {
  $("#auth").classList.add("hidden");
  $("#dashboard").classList.remove("hidden");
  $("#logout").classList.remove("hidden");
  $("#user-email").textContent = user.email;
  $("#today").textContent = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric" }).format(new Date());
  $("#workout-form [name=performedOn]").value = new Date().toISOString().slice(0, 10);
}
function showLogin() {
  $("#auth").classList.remove("hidden");
  $("#dashboard").classList.add("hidden");
  $("#logout").classList.add("hidden");
}
async function refresh() {
  [state.exercises, state.plans, state.workouts, state.goals] = await Promise.all([api("/exercises"), api("/plans"), api("/workouts"), api("/goals")]);
  $("#stat-exercises").textContent = state.exercises.length;
  $("#stat-plans").textContent = state.plans.length;
  $("#stat-workouts").textContent = state.workouts.length;
  $("#stat-goals").textContent = state.goals.filter(goal => !goal.completed).length;
  $("#exercise-list").innerHTML = state.exercises.length ? state.exercises.map(ex => `<div class="item"><strong>${escapeHtml(ex.name)}</strong><small>${escapeHtml(ex.muscle_group)}</small></div>`).join("") : '<div class="empty">Cadastre seu primeiro exercício.</div>';
  $("#plan-list").innerHTML = state.plans.length ? state.plans.map(plan => `<div class="item plan-item"><div class="item-text"><strong>${escapeHtml(plan.name)}</strong><small>Ficha #${plan.id}</small></div><div class="plan-actions"><select aria-label="Exercício para ${escapeHtml(plan.name)}"><option value="">Selecione um exercício</option>${state.exercises.map(ex => `<option value="${ex.id}">${escapeHtml(ex.name)}</option>`).join("")}</select><button class="primary" data-plan="${plan.id}" type="button">Adicionar</button></div></div>`).join("") : '<div class="empty">Crie uma ficha para começar.</div>';
  $("#workout-list").innerHTML = state.workouts.length ? state.workouts.map(workout => `<div class="item"><div class="item-text"><strong>${escapeHtml(workout.plan_name)}</strong><small>${escapeHtml(workout.performed_on)} · ${workout.entries.length} exercício(s)</small><small>${escapeHtml(workout.notes || "")}</small></div><button type="button" class="edit-button" data-workout="${workout.id}">Editar</button></div>`).join("") : '<div class="empty">Seus treinos aparecerão aqui.</div>';
  $("#goal-list").innerHTML = state.goals.length ? state.goals.map(goal => `<label class="goal"><span><input type="checkbox" data-goal="${goal.id}" ${goal.completed ? "checked" : ""}> ${escapeHtml(goal.description)}</span><small>Até ${escapeHtml(goal.target_date)}</small></label>`).join("") : '<div class="empty">Defina uma meta para manter o foco.</div>';
  const selected = $("#workout-plan").value;
  $("#workout-plan").innerHTML = '<option value="">Selecione uma ficha</option>' + state.plans.map(plan => `<option value="${plan.id}">${escapeHtml(plan.name)}</option>`).join("");
  if (selected) $("#workout-plan").value = selected;
  await renderWorkoutFields();
}
async function renderWorkoutFields() {
  const planId = $("#workout-plan").value;
  const container = $("#workout-entry-fields");
  if (!planId) { container.innerHTML = '<div class="empty">Selecione uma ficha para ver os exercícios.</div>'; return; }
  const exercises = await api(`/plans/${planId}/exercises`);
  container.innerHTML = exercises.length ? exercises.map(ex => `<div class="entry-row" data-exercise="${ex.id}"><strong>${escapeHtml(ex.name)}</strong><label>Séries<input type="number" min="1" max="20" value="3" required name="sets"></label><label>Reps<input type="number" min="1" max="100" value="10" required name="reps"></label><label>Carga kg<input type="number" min="0" max="1000" step="0.5" value="0" required name="weight"></label></div>`).join("") : '<div class="empty">Adicione exercícios a esta ficha antes de registrar o treino.</div>';
}
function submit(form, action) {
  form.addEventListener("submit", async event => { event.preventDefault(); try { await action(form); form.reset(); await refresh(); toast("Salvo com sucesso!"); } catch (error) { toast(error.message, true); } });
}
document.querySelectorAll("[data-auth]").forEach(tab => tab.addEventListener("click", () => {
  authMode = tab.dataset.auth;
  document.querySelectorAll("[data-auth]").forEach(item => item.classList.toggle("active", item === tab));
  $("#auth-title").textContent = authMode === "login" ? "Bem-vindo de volta" : "Comece sua jornada";
  $("#auth-subtitle").textContent = authMode === "login" ? "Continue de onde parou." : "Crie sua conta e acompanhe seu progresso.";
  $("#auth-submit").innerHTML = authMode === "login" ? 'Entrar <span>↗</span>' : 'Criar conta <span>↗</span>';
}));
$("#auth-form").addEventListener("submit", async event => {
  event.preventDefault();
  const body = formData(event.target);
  try {
    if (authMode === "register") { await api("/register", "POST", body); toast("Conta criada. Faça login."); document.querySelector('[data-auth="login"]').click(); event.target.reset(); return; }
    const user = await api("/login", "POST", body);
    showDashboard(user); await refresh();
  } catch (error) { toast(error.message, true); }
});
$("#logout").addEventListener("click", async () => { try { await api("/logout", "POST"); showLogin(); } catch (error) { toast(error.message, true); } });
submit($("#exercise-form"), form => api("/exercises", "POST", formData(form)));
submit($("#plan-form"), form => api("/plans", "POST", formData(form)));
submit($("#goal-form"), form => api("/goals", "POST", formData(form)));
$("#plan-list").addEventListener("click", async event => {
  const button = event.target.closest("[data-plan]"); if (!button) return;
  if (!state.exercises.length) { toast("Cadastre um exercício primeiro.", true); return; }
  const selected = button.parentElement.querySelector("select").value;
  if (!selected) { toast("Selecione um exercício.", true); return; }
  try { await api(`/plans/${button.dataset.plan}/exercises`, "POST", { exerciseId: Number(selected) }); await refresh(); toast("Exercício adicionado à ficha."); } catch (error) { toast(error.message, true); }
});
$("#workout-plan").addEventListener("change", () => renderWorkoutFields().catch(error => toast(error.message, true)));
$("#workout-list").addEventListener("click", async event => {
  const button = event.target.closest("[data-workout]"); if (!button) return;
  const workout = state.workouts.find(item => item.id === Number(button.dataset.workout));
  if (!workout) return;
  editingWorkoutId = workout.id;
  $("#workout-plan").value = workout.plan_id;
  $("#workout-plan").disabled = true;
  await renderWorkoutFields();
  $("#workout-form [name=performedOn]").value = workout.performed_on;
  $("#workout-form [name=notes]").value = workout.notes;
  for (const row of $("#workout-entry-fields").querySelectorAll("[data-exercise]")) {
    const entry = workout.entries.find(item => item.exercise_id === Number(row.dataset.exercise));
    if (entry) for (const field of ["sets", "reps", "weight"]) row.querySelector(`[name=${field}]`).value = entry[field];
  }
  $("#workout-form button[type=submit]").textContent = "Atualizar treino";
  $("#workout-form").scrollIntoView({ behavior: "smooth", block: "start" });
});
$("#goal-list").addEventListener("change", async event => {
  if (!event.target.matches("[data-goal]")) return;
  try { await api(`/goals/${event.target.dataset.goal}`, "PATCH", { completed: event.target.checked }); await refresh(); toast("Meta atualizada."); } catch (error) { toast(error.message, true); await refresh(); }
});
submit($("#workout-form"), async form => {
  const body = formData(form);
  body.planId = Number(body.planId);
  body.entries = [...form.querySelectorAll("[data-exercise]")].map(row => ({ exerciseId: Number(row.dataset.exercise), sets: Number(row.querySelector('[name="sets"]').value), reps: Number(row.querySelector('[name="reps"]').value), weight: Number(row.querySelector('[name="weight"]').value) }));
  if (editingWorkoutId) {
    await api(`/workouts/${editingWorkoutId}`, "PUT", body);
    editingWorkoutId = null;
    $("#workout-plan").disabled = false;
    $("#workout-form button[type=submit]").innerHTML = 'Salvar treino <span>↗</span>';
  } else await api("/workouts", "POST", body);
  $("#workout-form [name=performedOn]").defaultValue = new Date().toISOString().slice(0, 10);
});
api("/me").then(user => { showDashboard(user); return refresh(); }).catch(() => showLogin());

