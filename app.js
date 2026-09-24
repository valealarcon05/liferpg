/* ===================== Nivel Up - app.js ===================== */
const STORAGE_KEY = "nivelup_state_v1";
const QUOTES = [
  "Hoy construyes quién serás mañana.",
  "La disciplina es elegir entre lo que quieres ahora y lo que quieres más.",
  "Un 1% mejor cada día es todo lo que necesitas.",
  "Tu futuro te está mirando. No lo decepciones."
];
const MEAL_TYPES = ["Desayuno","Almuerzo","Merienda","Cena"];
const FAST_PROTOCOLS = { "16/8":[16,8], "12/12":[12,12], "14/10":[14,10], "18/6":[18,6], "20/4":[20,4] };

function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
function todayStr(){ return new Date().toISOString().slice(0,10); }
function nowTimeStr(){ const d=new Date(); return String(d.getHours()).padStart(2,'0')+":"+String(d.getMinutes()).padStart(2,'0'); }
function fmtDate(d){ return new Date(d).toLocaleDateString('es-ES',{day:'2-digit',month:'short'}); }
function minutesOf(t){ if(!t) return null; const [h,m]=t.split(':').map(Number); return h*60+m; }
function withinTolerance(actual, target, tol){
  const a=minutesOf(actual), b=minutesOf(target);
  if(a===null||b===null) return false;
  const diff = Math.abs(a-b);
  return Math.min(diff, 1440-diff) <= tol;
}

function defaultTomorrowPlan(){ return {fastStart:"", fastEnd:"", routineId:"", wake:"", reading:"", meals:{}, tasks:[]}; }

function defaultState(){
  return {
    profile:{ name:"Jugador", age:"", height:"", initialWeight:"", kcalGoal:2000, proteinGoal:120, sleepTime:"23:00", wakeTime:"07:00", reminderDaily:false, weighDays:7, fastProtocol:"16/8" },
    xp:0,
    boardUrls:[
      "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=300",
      "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=300",
      "https://images.unsplash.com/photo-1584735175315-9d5df23860e6?w=300",
      "https://images.unsplash.com/photo-1541534741688-6078c6bfb5c5?w=300",
      "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=300",
      "https://images.unsplash.com/photo-1526401485004-46910ecc8e51?w=300"
    ],
    fast:{start:"20:00", end:"12:00"},
    fastStatus:{active:false, startedAt:null, endedAt:null},
    sleepBonusDate:null,
    wakeBonusDate:null,
    mealsToday:{ Desayuno:{done:false}, Almuerzo:{done:false}, Merienda:{done:false}, Cena:{done:false} },
    todayPlannedMeals:{},
    mealsBonusGiven:false,
    tasks:[],
    routines:[],
    todayRoutineId:null,
    routineCompletedDate:null,
    foodCatalog:[],
    foodLog:[],
    measurements:[],
    books:[],
    rewards:[
      {id:uid(), name:"Ver un capítulo de serie", cost:20},
      {id:uid(), name:"Comida libre", cost:50}
    ],
    punishments:[],
    tomorrowPlan: defaultTomorrowPlan(),
    history:[], // {date, xp}
    streakDays:[], // array of date strings
    currentDate: todayStr()
  };
}

let state = load();

function load(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return defaultState();
    const parsed = JSON.parse(raw);
    const merged = Object.assign(defaultState(), parsed);
    merged.profile = Object.assign(defaultState().profile, parsed.profile||{});
    merged.tomorrowPlan = Object.assign(defaultTomorrowPlan(), parsed.tomorrowPlan||{});
    merged.fastStatus = Object.assign({active:false,startedAt:null,endedAt:null}, parsed.fastStatus||{});
    return merged;
  }catch(e){ console.error(e); return defaultState(); }
}
function save(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

/* ---------- XP / Level ---------- */
function calcLevel(xp){
  const level = Math.min(10, Math.floor(xp/100)+1);
  const min = (level-1)*100;
  const max = level*100;
  const pct = level>=10 ? 100 : Math.min(100, ((xp-min)/(max-min))*100);
  return {level, min, max, pct};
}
function addXp(amount, reason){
  state.xp = Math.max(0, state.xp + amount);
  let h = state.history.find(x=>x.date===todayStr());
  if(!h){ h = {date:todayStr(), xp:0}; state.history.push(h); }
  h.xp += amount;
  save();
  renderHeader();
  toast((amount>=0?"+":"") + amount + " XP" + (reason? " · "+reason : ""));
}

/* ---------- Daily rollover ---------- */
function ensureDailyReset(){
  if(state.currentDate !== todayStr()){
    const yesterday = state.currentDate;
    const yH = state.history.find(x=>x.date===yesterday);
    if(yH && yH.xp > 0){
      if(!state.streakDays.includes(yesterday)) state.streakDays.push(yesterday);
    } else {
      state.streakDays = [];
    }
    if(state.streakDays.length > 30) state.streakDays = state.streakDays.slice(-30);

    // Apply yesterday's "Planificar mañana" as today's plan
    const plan = state.tomorrowPlan || defaultTomorrowPlan();
    if(plan.fastStart) state.fast.start = plan.fastStart;
    if(plan.fastEnd) state.fast.end = plan.fastEnd;
    if(plan.routineId) state.todayRoutineId = plan.routineId;
    state.todayPlannedMeals = {};
    MEAL_TYPES.forEach(t=>{ if(plan.meals && plan.meals[t]) state.todayPlannedMeals[t] = plan.meals[t]; });
    if(plan.tasks && plan.tasks.length){
      plan.tasks.forEach(t=>{
        state.tasks.push({id:uid(), name:t.name, tag:t.tag, time:t.time, xp:t.xp, done:false, date:todayStr()});
      });
    }
    state.tomorrowPlan = defaultTomorrowPlan();

    state.mealsToday = { Desayuno:{done:false}, Almuerzo:{done:false}, Merienda:{done:false}, Cena:{done:false} };
    state.mealsBonusGiven = false;
    state.fastStatus = {active:false, startedAt:null, endedAt:null};
    state.currentDate = todayStr();
    save();
  }
}

/* ---------- Toast ---------- */
function toast(msg){
  const wrap = document.getElementById('toastWrap');
  const el = document.createElement('div');
  el.className = 'toast card2 px-4 py-2 text-sm font-medium shadow-lg';
  el.style.color = '#fbbf24';
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(()=>{ el.style.transition='opacity .4s'; el.style.opacity='0'; setTimeout(()=>el.remove(),400); }, 1800);
}

/* ---------- Modal ---------- */
function openModal(html){
  document.getElementById('modalBox').innerHTML = html;
  document.getElementById('modalOverlay').classList.remove('hidden');
}
function closeModal(){ document.getElementById('modalOverlay').classList.add('hidden'); }
document.getElementById('modalOverlay').addEventListener('click', (e)=>{ if(e.target.id==='modalOverlay') closeModal(); });

/* ---------- Navigation ---------- */
function showView(name){
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.getElementById('view-'+name).classList.add('active');
  document.querySelectorAll('.navlink').forEach(b=>b.classList.toggle('active', b.dataset.view===name));
  closeNav();
  renderAll();
}
document.querySelectorAll('[data-view]').forEach(btn=>{
  btn.addEventListener('click', ()=> showView(btn.dataset.view));
});
document.getElementById('menuBtn').addEventListener('click', openNav);
document.getElementById('rewardsBtn').addEventListener('click', ()=> showView('rewards'));
document.getElementById('editBoardBtn').addEventListener('click', ()=> showView('settings'));
function openNav(){ document.getElementById('sideNav').style.transform='translateX(0)'; document.getElementById('navOverlay').classList.remove('hidden'); }
function closeNav(){ document.getElementById('sideNav').style.transform='translateX(-100%)'; document.getElementById('navOverlay').classList.add('hidden'); }
document.getElementById('navOverlay').addEventListener('click', closeNav);

/* ---------- Header ---------- */
function renderHeader(){
  const {level, pct, max} = calcLevel(state.xp);
  document.getElementById('headerName').textContent = state.profile.name || "Jugador";
  document.getElementById('headerLevel').textContent = "Nivel " + level;
  const xpBar = document.getElementById('xpBar'); if(xpBar) xpBar.style.width = pct+"%";
  const xpText = document.getElementById('xpText');
  if(xpText) xpText.textContent = state.xp + " / " + max + " XP";
}

/* ===================== HOME ===================== */
function foodName(id){ const f = state.foodCatalog.find(x=>x.id===id); return f ? f.name : "(alimento eliminado)"; }
function todaysFoodLog(){ return state.foodLog.filter(f=>f.date===todayStr()); }

function renderHome(){
  document.getElementById('motivationalQuote').textContent = '"' + QUOTES[new Date().getDate()%QUOTES.length] + '"';
  const board = document.getElementById('visualBoard');
  board.innerHTML = state.boardUrls.slice(0,6).map(u=>`<img src="${u}" class="w-full h-20 object-cover rounded-lg" onerror="this.style.opacity=0.15">`).join('');

  renderFastCard();
  renderSleepCard();

  // Comidas de hoy: solo lo planificado + registro de lo consumido
  const mealsList = document.getElementById('mealsList');
  const plannedTypes = MEAL_TYPES.filter(t=>state.todayPlannedMeals[t]);
  let html = '';
  if(plannedTypes.length){
    html += plannedTypes.map(t=>{
      const done = state.mealsToday[t] && state.mealsToday[t].done;
      const fid = state.todayPlannedMeals[t];
      return `<div class="flex items-center justify-between card2 px-3 py-2">
        <div>
          <div class="text-sm ${done?'line-through opacity-50':''}">${t}: ${foodName(fid)}</div>
        </div>
        <button data-meal="${t}" class="mealCheck checkbox-round ${done?'done':''}">${done?'✓':''}</button>
      </div>`;
    }).join('');
  } else {
    html += `<p class="text-sm" style="color:var(--sub)">No hay comidas planificadas para hoy. Planifícalas en "Canje / Mañana".</p>`;
  }
  const consumed = todaysFoodLog();
  if(consumed.length){
    html += `<div class="text-xs mt-3 mb-1" style="color:var(--sub)">Ya registrado hoy:</div>` +
      consumed.map(f=>`<div class="text-xs card2 px-3 py-1.5 flex justify-between"><span>${f.meal}: ${f.name}</span><span style="color:var(--sub)">${f.kcal} kcal</span></div>`).join('');
  }
  mealsList.innerHTML = html;
  mealsList.querySelectorAll('.mealCheck').forEach(b=>b.addEventListener('click', ()=>toggleMeal(b.dataset.meal)));

  // Entrenamiento de hoy: solo lectura
  const r = state.routines.find(x=>x.id===state.todayRoutineId);
  document.getElementById('todayRoutineName').textContent = r ? r.name : "Sin rutina asignada";
  const isDoneToday = state.routineCompletedDate === todayStr();
  document.getElementById('todayRoutineStatus').textContent = isDoneToday ? "✅ Completado hoy" : "Pendiente";
  const btnR = document.getElementById('completeTodayRoutine');
  btnR.disabled = isDoneToday || !state.todayRoutineId;
  btnR.style.opacity = btnR.disabled ? .4 : 1;
  btnR.onclick = ()=>{
    if(!state.todayRoutineId) return;
    state.routineCompletedDate = todayStr(); save();
    addXp(5, "rutina completada");
    renderAll();
  };

  const tasksList = document.getElementById('tasksList');
  const todays = state.tasks.filter(t=>t.date===todayStr());
  tasksList.innerHTML = todays.length ? todays.map(t=>`
    <div class="flex items-center gap-3 card2 px-3 py-2">
      <button data-task="${t.id}" class="taskCheck checkbox-round ${t.done?'done':''}">${t.done?'✓':''}</button>
      <div class="flex-1">
        <div class="text-sm ${t.done?'line-through opacity-50':''}">${t.name}</div>
        <div class="text-xs flex gap-2 mt-0.5" style="color:var(--sub)">
          ${t.tag?`<span class="chip">${t.tag}</span>`:''}
          ${t.time?`<span>${t.time}</span>`:''}
          <span>${t.xp} XP</span>
        </div>
      </div>
      <button data-del="${t.id}" class="delTask text-xs" style="color:var(--red)">✕</button>
    </div>`).join('') : `<p class="text-sm" style="color:var(--sub)">Sin tareas hoy. ¡Añade una!</p>`;
  tasksList.querySelectorAll('.taskCheck').forEach(b=>b.addEventListener('click', ()=>toggleTask(b.dataset.task)));
  tasksList.querySelectorAll('.delTask').forEach(b=>b.addEventListener('click', ()=>{ state.tasks = state.tasks.filter(t=>t.id!==b.dataset.del); save(); renderHome(); }));

  const reading = document.getElementById('readingToday');
  const current = state.books.find(b=>b.status==='Leyendo');
  reading.innerHTML = current ? `
    <div class="card2 px-3 py-2 flex items-center justify-between">
      <div><div class="text-sm">${current.title}</div><div class="text-xs" style="color:var(--sub)">${current.readChapters}/${current.totalChapters} capítulos</div></div>
      <button id="quickReadPlus" class="btn-accent text-xs px-3 py-1.5">+1 cap.</button>
    </div>` : `<p class="text-sm" style="color:var(--sub)">No tienes un libro "Leyendo" activo. Ve a Libros.</p>`;
  const qp = document.getElementById('quickReadPlus');
  if(qp) qp.addEventListener('click', ()=> incReadChapter(current.id));
}

function renderFastCard(){
  document.getElementById('fastWindowText').textContent = state.fast.start + " - " + state.fast.end;
  const fs = state.fastStatus;
  const statusEl = document.getElementById('fastStatusText');
  statusEl.textContent = fs.active ? ("En curso desde " + fs.startedAt) : (fs.endedAt ? ("Finalizado " + fs.endedAt) : "Sin ayuno activo");
  const startBtn = document.getElementById('startFastBtn');
  const endBtn = document.getElementById('endFastBtn');
  startBtn.disabled = fs.active; startBtn.style.opacity = fs.active ? .4 : 1;
  endBtn.disabled = !fs.active; endBtn.style.opacity = !fs.active ? .4 : 1;
}
document.getElementById('startFastBtn').addEventListener('click', ()=>{
  state.fastStatus = {active:true, startedAt:nowTimeStr(), endedAt:null}; save(); renderFastCard(); toast("Ayuno iniciado");
});
document.getElementById('endFastBtn').addEventListener('click', ()=>{
  state.fastStatus.active = false; state.fastStatus.endedAt = nowTimeStr(); save(); renderFastCard(); toast("Ayuno finalizado");
});

function renderSleepCard(){
  const p = state.profile;
  const gotSleepBonus = state.sleepBonusDate === todayStr();
  const gotWakeBonus = state.wakeBonusDate === todayStr();
  document.getElementById('sleepStatusText').innerHTML =
    `Meta: dormir <b>${p.sleepTime}</b> · despertar <b>${p.wakeTime}</b><br>` +
    (gotSleepBonus ? '✅ Dormiste a tiempo (+5 XP) ' : '') + (gotWakeBonus ? '✅ Despertaste a tiempo (+5 XP)' : '');
}
document.getElementById('wakeBtn').addEventListener('click', ()=>{
  if(state.wakeBonusDate === todayStr()){ toast("Ya registrado hoy"); return; }
  const t = nowTimeStr();
  if(withinTolerance(t, state.profile.wakeTime, 30)){
    state.wakeBonusDate = todayStr(); save();
    addXp(5, "despertaste a tiempo");
  } else { toast("Registrado (fuera del horario meta)"); }
  renderSleepCard();
});
document.getElementById('sleepBtn').addEventListener('click', ()=>{
  if(state.sleepBonusDate === todayStr()){ toast("Ya registrado hoy"); return; }
  const t = nowTimeStr();
  if(withinTolerance(t, state.profile.sleepTime, 30)){
    state.sleepBonusDate = todayStr(); save();
    addXp(5, "dormiste a tiempo");
  } else { toast("Registrado (fuera del horario meta)"); }
  renderSleepCard();
});

function toggleMeal(m){
  state.mealsToday[m] = state.mealsToday[m] || {done:false};
  state.mealsToday[m].done = !state.mealsToday[m].done;
  const plannedTypes = MEAL_TYPES.filter(t=>state.todayPlannedMeals[t]);
  const allDone = plannedTypes.length>0 && plannedTypes.every(t=>state.mealsToday[t] && state.mealsToday[t].done);
  const kcalToday = todaysFoodLog().reduce((s,f)=>s+Number(f.kcal||0),0);
  if(allDone && !state.mealsBonusGiven && kcalToday>0 && kcalToday<=Number(state.profile.kcalGoal||99999)){
    state.mealsBonusGiven = true;
    save();
    addXp(10, "límite de kcal respetado");
  }
  save(); renderHome();
}
function toggleTask(id){
  const t = state.tasks.find(x=>x.id===id);
  if(!t) return;
  t.done = !t.done;
  save();
  if(t.done) addXp(Number(t.xp||0), "tarea: "+t.name);
  renderHome();
}
document.getElementById('addTaskBtn').addEventListener('click', ()=>{
  openModal(`
    <h3 class="font-semibold mb-3">Nueva tarea</h3>
    <div class="space-y-2">
      <input id="mTaskName" class="input" placeholder="Nombre de la tarea">
      <input id="mTaskTag" class="input" placeholder="Etiqueta (opcional)">
      <input id="mTaskTime" type="time" class="input">
      <input id="mTaskXp" type="number" class="input" placeholder="XP asignado" value="5">
    </div>
    <div class="flex gap-2 mt-4">
      <button id="mCancel" class="btn-ghost flex-1 py-2.5">Cancelar</button>
      <button id="mSave" class="btn-accent flex-1 py-2.5">Guardar</button>
    </div>`);
  document.getElementById('mCancel').onclick = closeModal;
  document.getElementById('mSave').onclick = ()=>{
    const name = document.getElementById('mTaskName').value.trim();
    if(!name) return;
    state.tasks.push({id:uid(), name, tag:document.getElementById('mTaskTag').value.trim(), time:document.getElementById('mTaskTime').value, xp:Number(document.getElementById('mTaskXp').value)||0, done:false, date:todayStr()});
    save(); closeModal(); renderHome();
  };
});

/* ===================== FOOD ===================== */
function renderFood(){
  const sel = document.getElementById('foodCatalogSelect');
  const prevVal = sel.value;
  sel.innerHTML = '<option value="">+ Nuevo alimento</option>' + state.foodCatalog.map(f=>`<option value="${f.id}">${f.name} (${f.kcal} kcal / ${f.protein}g)</option>`).join('');
  sel.value = state.foodCatalog.some(f=>f.id===prevVal) ? prevVal : "";
  document.getElementById('newFoodFields').classList.toggle('hidden', sel.value !== "");
  if(!sel.dataset.bound){
    sel.addEventListener('change', ()=> document.getElementById('newFoodFields').classList.toggle('hidden', sel.value !== ""));
    sel.dataset.bound = '1';
  }

  const log = todaysFoodLog();
  const kcal = log.reduce((s,f)=>s+Number(f.kcal||0),0);
  const prot = log.reduce((s,f)=>s+Number(f.protein||0),0);
  document.getElementById('kcalToday').textContent = kcal;
  document.getElementById('proteinToday').textContent = prot + " g";

  const list = document.getElementById('foodLogList');
  list.innerHTML = log.length ? log.map(f=>`
    <div class="flex items-center justify-between card2 px-3 py-2">
      <div><div class="text-sm">${f.name}</div><div class="text-xs" style="color:var(--sub)">${f.meal} · ${f.kcal} kcal · ${f.protein}g prot</div></div>
      <button data-del="${f.id}" class="delFood text-xs" style="color:var(--red)">✕</button>
    </div>`).join('') : `<p class="text-sm" style="color:var(--sub)">Sin registros hoy.</p>`;
  list.querySelectorAll('.delFood').forEach(b=>b.addEventListener('click', ()=>{ state.foodLog = state.foodLog.filter(f=>f.id!==b.dataset.del); save(); renderFood(); }));

  const last7 = lastNDates(7);
  const kcalByDay = last7.map(d => state.foodLog.filter(f=>f.date===d).reduce((s,f)=>s+Number(f.kcal||0),0));
  drawChart('chartCalories', 'bar', last7.map(fmtDate), [{label:'Kcal', data:kcalByDay, backgroundColor:'#7c3aed'}]);
  drawChart('chartMacros', 'doughnut', null, [{data:[prot*4, Math.max(kcal-prot*4,0)], backgroundColor:['#fbbf24','#2a2f3d']}], ['Proteína (kcal)','Otros (kcal)']);
}
document.getElementById('addFoodBtn').addEventListener('click', ()=>{
  const sel = document.getElementById('foodCatalogSelect');
  const meal = document.getElementById('foodMeal').value;
  let food;
  if(sel.value === ""){
    const name = document.getElementById('foodName').value.trim();
    const kcalV = Number(document.getElementById('foodKcal').value)||0;
    const protV = Number(document.getElementById('foodProtein').value)||0;
    if(!name) return;
    food = {id:uid(), name, kcal:kcalV, protein:protV};
    state.foodCatalog.push(food);
    document.getElementById('foodName').value=''; document.getElementById('foodKcal').value=''; document.getElementById('foodProtein').value='';
  } else {
    food = state.foodCatalog.find(f=>f.id===sel.value);
    if(!food) return;
  }
  state.foodLog.push({id:uid(), date:todayStr(), meal, name:food.name, kcal:food.kcal, protein:food.protein});
  save();
  renderFood(); renderHome();
});

/* ===================== EXERCISE ===================== */
function renderExercise(){
  const routineSel = document.getElementById('exRoutineSelect');
  routineSel.innerHTML = state.routines.length ? state.routines.map(r=>`<option value="${r.id}">${r.name}</option>`).join('') : '<option value="">Sin rutinas — crea una abajo</option>';
  if(!routineSel.dataset.bound){ routineSel.addEventListener('change', renderExList); routineSel.dataset.bound='1'; }
  renderExList();

  const parentSel = document.getElementById('exParentRoutine');
  parentSel.innerHTML = state.routines.map(r=>`<option value="${r.id}">${r.name}</option>`).join('');

  const btn = document.getElementById('claimRoutineXp');
  const rid = routineSel.value;
  const done = state.routineCompletedDate===todayStr();
  btn.disabled = done || !rid;
  btn.style.opacity = btn.disabled ? .4 : 1;
  btn.onclick = ()=>{ state.todayRoutineId = rid; state.routineCompletedDate = todayStr(); save(); addXp(5,"rutina completada"); renderAll(); };
}
function renderExList(){
  const rid = document.getElementById('exRoutineSelect').value;
  const r = state.routines.find(x=>x.id===rid);
  const list = document.getElementById('exList');
  if(!r){ list.innerHTML = ''; return; }
  list.innerHTML = (r.exercises||[]).map(e=>`
    <div class="card2 px-3 py-2 flex items-center justify-between">
      <div>
        <div class="text-sm">${e.name} <span class="chip">${e.group||''}</span></div>
        <div class="text-xs" style="color:var(--sub)">${e.sets||0}x${e.reps||0} · ${e.weight||0}kg${e.minutes?` · ${e.minutes}min`:''}</div>
      </div>
      <button data-ex="${e.id}" data-r="${r.id}" class="editWeight btn-ghost text-xs px-2 py-1">+kg</button>
    </div>`).join('') || `<p class="text-sm" style="color:var(--sub)">Sin ejercicios en esta rutina.</p>`;
  list.querySelectorAll('.editWeight').forEach(b=>b.addEventListener('click', ()=>{
    const rr = state.routines.find(x=>x.id===b.dataset.r);
    const ex = rr.exercises.find(x=>x.id===b.dataset.ex);
    const nv = prompt("Nuevo peso (kg) para "+ex.name, ex.weight||0);
    if(nv===null) return;
    const diff = Number(nv) - Number(ex.weight||0);
    ex.weight = Number(nv); save();
    if(diff>0) addXp(Math.round(diff*2), "progreso en "+ex.name);
    renderExList();
  }));
}
document.getElementById('newExType').addEventListener('change', e=>{
  document.getElementById('routineFields').classList.toggle('hidden', e.target.value!=='routine');
  document.getElementById('exerciseFields').classList.toggle('hidden', e.target.value!=='exercise');
});
document.getElementById('saveExBtn').addEventListener('click', ()=>{
  const type = document.getElementById('newExType').value;
  if(type==='routine'){
    const name = document.getElementById('routineName').value.trim();
    if(!name) return;
    state.routines.push({id:uid(), name, exercises:[]});
    document.getElementById('routineName').value='';
  } else {
    const rid = document.getElementById('exParentRoutine').value;
    const r = state.routines.find(x=>x.id===rid);
    if(!r) return;
    r.exercises.push({
      id:uid(), name:document.getElementById('exName').value.trim(),
      group:document.getElementById('exGroup').value.trim(),
      sets:Number(document.getElementById('exSets').value)||0,
      reps:Number(document.getElementById('exReps').value)||0,
      weight:Number(document.getElementById('exWeight').value)||0,
      minutes:Number(document.getElementById('exMinutes').value)||0
    });
    ['exName','exGroup','exSets','exReps','exWeight','exMinutes'].forEach(id=>document.getElementById(id).value='');
  }
  save(); renderExercise();
});

/* ===================== BODY MEASURES ===================== */
function renderBody(){
  const last = [...state.measurements].sort((a,b)=>a.date.localeCompare(b.date));
  drawChart('chartWeight', 'line', last.map(m=>fmtDate(m.date)), [{label:'Peso (kg)', data:last.map(m=>m.weight), borderColor:'#7c3aed', tension:.3}]);
  drawChart('chartMeasures', 'line', last.map(m=>fmtDate(m.date)), [
    {label:'Brazo', data:last.map(m=>m.arm), borderColor:'#fbbf24', tension:.3},
    {label:'Pierna', data:last.map(m=>m.leg), borderColor:'#34d399', tension:.3},
    {label:'Abdomen', data:last.map(m=>m.abdomen), borderColor:'#f87171', tension:.3}
  ]);
}
document.getElementById('addMeasureBtn').addEventListener('click', ()=>{
  const weight = Number(document.getElementById('mWeight').value)||null;
  const entry = {date:todayStr(), weight, arm:Number(document.getElementById('mArm').value)||null, leg:Number(document.getElementById('mLeg').value)||null, abdomen:Number(document.getElementById('mAbdomen').value)||null};
  const prevWithWeight = [...state.measurements].reverse().find(m=>m.weight);
  state.measurements.push(entry);
  save();
  if(weight && prevWithWeight && prevWithWeight.weight){
    const diff = prevWithWeight.weight - weight;
    if(diff>=1) addXp(Math.floor(diff)*30, "pérdida de peso");
  }
  ['mWeight','mArm','mLeg','mAbdomen'].forEach(id=>document.getElementById(id).value='');
  renderBody();
});

/* ===================== BOOKS ===================== */
function renderBooks(){
  const list = document.getElementById('booksList');
  list.innerHTML = state.books.length ? state.books.map(b=>`
    <div class="card p-4">
      <div class="flex justify-between items-start">
        <div>
          <div class="font-semibold">${b.title}</div>
          <div class="text-xs mt-1" style="color:var(--sub)">${b.readChapters}/${b.totalChapters} capítulos</div>
        </div>
        <select data-b="${b.id}" class="bookStatusSel input" style="width:auto; font-size:.75rem; padding:.35rem .5rem;">
          <option ${b.status==='Por leer'?'selected':''}>Por leer</option>
          <option ${b.status==='Leyendo'?'selected':''}>Leyendo</option>
          <option ${b.status==='Leído'?'selected':''}>Leído</option>
        </select>
      </div>
      <div class="xp-bar-bg h-2 mt-3"><div class="xp-bar-fill" style="width:${Math.min(100,(b.readChapters/(b.totalChapters||1))*100)}%"></div></div>
      <div class="flex gap-2 mt-3">
        <button data-inc="${b.id}" class="btn-ghost text-xs flex-1 py-1.5">+1 capítulo</button>
        <button data-delb="${b.id}" class="btn-ghost text-xs px-3 py-1.5" style="color:var(--red)">Eliminar</button>
      </div>
    </div>`).join('') : `<p class="text-sm text-center" style="color:var(--sub)">Sin libros aún.</p>`;
  list.querySelectorAll('.bookStatusSel').forEach(s=>s.addEventListener('change', ()=>{ state.books.find(b=>b.id===s.dataset.b).status=s.value; save(); renderBooks(); }));
  list.querySelectorAll('[data-inc]').forEach(b=>b.addEventListener('click', ()=>incReadChapter(b.dataset.inc)));
  list.querySelectorAll('[data-delb]').forEach(b=>b.addEventListener('click', ()=>{ state.books=state.books.filter(x=>x.id!==b.dataset.delb); save(); renderBooks(); }));
}
function incReadChapter(id){
  const b = state.books.find(x=>x.id===id);
  if(!b) return;
  b.readChapters = Math.min((b.totalChapters||b.readChapters+1), b.readChapters+1);
  if(b.readChapters >= b.totalChapters && b.status!=='Leído'){
    b.status = 'Leído'; save();
    addXp(30, "libro completado: "+b.title);
  } else save();
  renderBooks(); renderHome();
}
document.getElementById('addBookBtn').addEventListener('click', ()=>{
  const title = document.getElementById('bookTitle').value.trim();
  if(!title) return;
  state.books.push({id:uid(), title, totalChapters:Number(document.getElementById('bookChapters').value)||1, readChapters:0, status:document.getElementById('bookStatus').value});
  save();
  document.getElementById('bookTitle').value=''; document.getElementById('bookChapters').value='';
  renderBooks();
});

/* ===================== REWARDS / TOMORROW ===================== */
function lastNDates(n){
  const arr=[]; for(let i=n-1;i>=0;i--){ const d=new Date(); d.setDate(d.getDate()-i); arr.push(d.toISOString().slice(0,10)); } return arr;
}
function renderRewards(){
  const todayH = state.history.find(h=>h.date===todayStr());
  document.getElementById('xpTodayBig').textContent = todayH? todayH.xp : 0;

  const grid = document.getElementById('streakGrid');
  const days30 = lastNDates(30);
  grid.innerHTML = days30.map(d=>`<div class="streak-dot ${state.streakDays.includes(d)?'on':''}"></div>`).join('');
  document.getElementById('streakCount').textContent = state.streakDays.length;

  const last14 = lastNDates(14);
  const xpData = last14.map(d=>{ const h=state.history.find(x=>x.date===d); return h?h.xp:0; });
  drawChart('chartXp', 'line', last14.map(fmtDate), [{label:'XP', data:xpData, borderColor:'#fbbf24', tension:.3}]);

  renderRewardsList();
  renderPunishList();

  // Planificar mañana
  document.getElementById('planFastStart').value = state.tomorrowPlan.fastStart || '';
  document.getElementById('planFastEnd').value = state.tomorrowPlan.fastEnd || '';
  document.getElementById('planWake').value = state.tomorrowPlan.wake || '';
  document.getElementById('planReading').value = state.tomorrowPlan.reading || '';

  const routineSel = document.getElementById('planRoutineSelect');
  routineSel.innerHTML = '<option value="">Sin rutina</option>' + state.routines.map(r=>`<option value="${r.id}" ${state.tomorrowPlan.routineId===r.id?'selected':''}>${r.name}</option>`).join('');

  const mealsWrap = document.getElementById('planMealsWrap');
  const foodOptions = '<option value="">Ninguno</option>' + state.foodCatalog.map(f=>`<option value="${f.id}">${f.name}</option>`).join('');
  mealsWrap.innerHTML = MEAL_TYPES.map(t=>{
    const sel = state.tomorrowPlan.meals[t] || '';
    return `<div class="flex items-center gap-2">
      <label class="text-xs w-20 flex-shrink-0" style="color:var(--sub)">${t}</label>
      <select class="input planMealSel" data-type="${t}">${foodOptions.replace(`value="${sel}"`, `value="${sel}" selected`)}</select>
    </div>`;
  }).join('');

  renderPlanTasksList();
}
function renderRewardsList(){
  const rl = document.getElementById('rewardsList');
  rl.innerHTML = state.rewards.length ? state.rewards.map(r=>`
    <div class="flex items-center justify-between card2 px-3 py-2">
      <div class="text-sm">${r.name} <span class="chip ml-1">${r.cost} XP</span></div>
      <div class="flex gap-2">
        <button data-redeem="${r.id}" class="btn-accent text-xs px-2 py-1">Canjear</button>
        <button data-delr="${r.id}" class="text-xs" style="color:var(--red)">✕</button>
      </div>
    </div>`).join('') : `<p class="text-sm" style="color:var(--sub)">Sin premios aún.</p>`;
  rl.querySelectorAll('[data-redeem]').forEach(b=>b.addEventListener('click', ()=>{
    const r = state.rewards.find(x=>x.id===b.dataset.redeem);
    if(state.xp < r.cost){ toast("XP insuficiente"); return; }
    addXp(-r.cost, "canje: "+r.name);
  }));
  rl.querySelectorAll('[data-delr]').forEach(b=>b.addEventListener('click', ()=>{ state.rewards=state.rewards.filter(x=>x.id!==b.dataset.delr); save(); renderRewardsList(); }));
}
function renderPunishList(){
  const pl = document.getElementById('punishList');
  pl.innerHTML = state.punishments.length ? state.punishments.map(p=>`
    <div class="card2 px-3 py-2">
      <div class="flex items-center justify-between">
        <span class="text-sm">${p.name} <span class="chip ml-1" style="color:var(--red)">-${p.xp} XP</span></span>
        <button data-delp="${p.id}" class="text-xs" style="color:var(--red)">✕</button>
      </div>
      ${p.reason? `<div class="text-xs mt-1" style="color:var(--sub)">${p.reason}</div>` : ''}
    </div>`).join('') : `<p class="text-sm" style="color:var(--sub)">Ninguno registrado.</p>`;
  pl.querySelectorAll('[data-delp]').forEach(b=>b.addEventListener('click', ()=>{ state.punishments=state.punishments.filter(x=>x.id!==b.dataset.delp); save(); renderPunishList(); }));
}
function renderPlanTasksList(){
  const wrap = document.getElementById('planTasksList');
  const tasks = state.tomorrowPlan.tasks || [];
  wrap.innerHTML = tasks.length ? tasks.map(t=>`
    <div class="flex items-center justify-between card2 px-3 py-2">
      <div class="text-sm">${t.name} <span class="chip ml-1">${t.xp} XP</span> ${t.time?`<span class="text-xs" style="color:var(--sub)"> · ${t.time}</span>`:''}</div>
      <button data-delpt="${t.id}" class="text-xs" style="color:var(--red)">✕</button>
    </div>`).join('') : `<p class="text-xs" style="color:var(--sub)">Sin tareas planificadas.</p>`;
  wrap.querySelectorAll('[data-delpt]').forEach(b=>b.addEventListener('click', ()=>{
    state.tomorrowPlan.tasks = state.tomorrowPlan.tasks.filter(t=>t.id!==b.dataset.delpt); save(); renderPlanTasksList();
  }));
}
document.getElementById('addRewardBtn').addEventListener('click', ()=>{
  openModal(`<h3 class="font-semibold mb-3">Nuevo premio</h3>
    <div class="space-y-2"><input id="mRName" class="input" placeholder="Nombre del premio"><input id="mRCost" type="number" class="input" placeholder="Costo en XP"></div>
    <div class="flex gap-2 mt-4"><button id="mCancel" class="btn-ghost flex-1 py-2.5">Cancelar</button><button id="mSave" class="btn-accent flex-1 py-2.5">Guardar</button></div>`);
  document.getElementById('mCancel').onclick = closeModal;
  document.getElementById('mSave').onclick = ()=>{
    const name = document.getElementById('mRName').value.trim(); if(!name) return;
    const cost = Number(document.getElementById('mRCost').value)||0;
    state.rewards.push({id:uid(), name, cost});
    save();
    closeModal();
    renderRewardsList();
  };
});
document.getElementById('addPunishBtn').addEventListener('click', ()=>{
  openModal(`<h3 class="font-semibold mb-3">Nuevo castigo</h3>
    <div class="space-y-2">
      <input id="mPName" class="input" placeholder="Nombre del castigo">
      <input id="mPXp" type="number" class="input" placeholder="XP a restar">
      <textarea id="mPReason" class="input" rows="3" placeholder="Razón / motivo"></textarea>
    </div>
    <div class="flex gap-2 mt-4"><button id="mCancel" class="btn-ghost flex-1 py-2.5">Cancelar</button><button id="mSave" class="btn-accent flex-1 py-2.5">Guardar</button></div>`);
  document.getElementById('mCancel').onclick = closeModal;
  document.getElementById('mSave').onclick = ()=>{
    const name = document.getElementById('mPName').value.trim(); if(!name) return;
    const xp = Number(document.getElementById('mPXp').value)||0;
    const reason = document.getElementById('mPReason').value.trim();
    state.punishments.push({id:uid(), name, xp, reason, date:todayStr()});
    save();
    closeModal();
    renderPunishList();
    if(xp>0) addXp(-xp, "castigo: "+name);
  };
});
document.getElementById('planAddTaskBtn').addEventListener('click', ()=>{
  openModal(`
    <h3 class="font-semibold mb-3">Tarea para mañana</h3>
    <div class="space-y-2">
      <input id="mTaskName" class="input" placeholder="Nombre de la tarea">
      <input id="mTaskTag" class="input" placeholder="Etiqueta (opcional)">
      <input id="mTaskTime" type="time" class="input">
      <input id="mTaskXp" type="number" class="input" placeholder="XP asignado" value="5">
    </div>
    <div class="flex gap-2 mt-4">
      <button id="mCancel" class="btn-ghost flex-1 py-2.5">Cancelar</button>
      <button id="mSave" class="btn-accent flex-1 py-2.5">Guardar</button>
    </div>`);
  document.getElementById('mCancel').onclick = closeModal;
  document.getElementById('mSave').onclick = ()=>{
    const name = document.getElementById('mTaskName').value.trim();
    if(!name) return;
    state.tomorrowPlan.tasks = state.tomorrowPlan.tasks || [];
    state.tomorrowPlan.tasks.push({id:uid(), name, tag:document.getElementById('mTaskTag').value.trim(), time:document.getElementById('mTaskTime').value, xp:Number(document.getElementById('mTaskXp').value)||0});
    save(); closeModal(); renderPlanTasksList();
  };
});
document.getElementById('savePlanBtn').addEventListener('click', ()=>{
  const meals = {};
  document.querySelectorAll('.planMealSel').forEach(sel=>{ if(sel.value) meals[sel.dataset.type] = sel.value; });
  state.tomorrowPlan = {
    fastStart: document.getElementById('planFastStart').value,
    fastEnd: document.getElementById('planFastEnd').value,
    routineId: document.getElementById('planRoutineSelect').value,
    wake: document.getElementById('planWake').value,
    reading: document.getElementById('planReading').value,
    meals,
    tasks: state.tomorrowPlan.tasks || []
  };
  save(); toast("Plan de mañana guardado");
});

/* ===================== SETTINGS ===================== */
function renderSettings(){
  const p = state.profile;
  document.getElementById('setName').value = p.name;
  document.getElementById('setAge').value = p.age;
  document.getElementById('setHeight').value = p.height;
  document.getElementById('setInitialWeight').value = p.initialWeight;
  document.getElementById('setKcalGoal').value = p.kcalGoal;
  document.getElementById('setProteinGoal').value = p.proteinGoal;
  document.getElementById('setSleepTime').value = p.sleepTime;
  document.getElementById('setWakeTime').value = p.wakeTime;
  document.getElementById('setReminderDaily').checked = p.reminderDaily;
  document.getElementById('setWeighDays').value = p.weighDays;
  document.getElementById('setFastProtocol').value = p.fastProtocol || '16/8';
  renderFastProtocolInfo();
  renderBoardUrlInputs();
}
function renderFastProtocolInfo(){
  const val = document.getElementById('setFastProtocol').value;
  const info = document.getElementById('fastProtocolInfo');
  if(FAST_PROTOCOLS[val]){
    const [f,e] = FAST_PROTOCOLS[val];
    info.textContent = `Ventana de ayuno: ${f}h · Ventana de ingesta: ${e}h`;
  } else {
    info.textContent = 'Configura tus propios horarios en "Canje / Mañana".';
  }
}
document.getElementById('setFastProtocol').addEventListener('change', renderFastProtocolInfo);
function renderBoardUrlInputs(){
  const wrap = document.getElementById('boardUrlsWrap');
  wrap.innerHTML = state.boardUrls.map((u,i)=>`<div class="flex gap-2"><input class="input boardUrlInput" data-i="${i}" value="${u}"><button data-rm="${i}" class="text-xs px-2" style="color:var(--red)">✕</button></div>`).join('');
  wrap.querySelectorAll('.boardUrlInput').forEach(inp=>inp.addEventListener('change', ()=>{ state.boardUrls[inp.dataset.i]=inp.value; save(); }));
  wrap.querySelectorAll('[data-rm]').forEach(b=>b.addEventListener('click', ()=>{ state.boardUrls.splice(Number(b.dataset.rm),1); save(); renderBoardUrlInputs(); }));
}
document.getElementById('addBoardUrlBtn').addEventListener('click', ()=>{ state.boardUrls.push(''); save(); renderBoardUrlInputs(); });
document.getElementById('saveSettingsBtn').addEventListener('click', ()=>{
  state.profile = {
    name:document.getElementById('setName').value.trim()||'Jugador',
    age:document.getElementById('setAge').value, height:document.getElementById('setHeight').value,
    initialWeight:document.getElementById('setInitialWeight').value,
    kcalGoal:Number(document.getElementById('setKcalGoal').value)||2000,
    proteinGoal:Number(document.getElementById('setProteinGoal').value)||120,
    sleepTime:document.getElementById('setSleepTime').value, wakeTime:document.getElementById('setWakeTime').value,
    reminderDaily:document.getElementById('setReminderDaily').checked,
    weighDays:Number(document.getElementById('setWeighDays').value)||7,
    fastProtocol:document.getElementById('setFastProtocol').value
  };
  save(); renderHeader(); toast("Configuración guardada");
});
document.getElementById('exportBtn').addEventListener('click', ()=>{
  const blob = new Blob([JSON.stringify(state,null,2)], {type:'application/json'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'nivelup-backup-'+todayStr()+'.json'; a.click();
});
document.getElementById('importBtn').addEventListener('click', ()=> document.getElementById('importFile').click());
document.getElementById('importFile').addEventListener('change', (e)=>{
  const file = e.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = ()=>{
    try{ state = Object.assign(defaultState(), JSON.parse(reader.result)); save(); toast("Respaldo importado"); renderAll(); renderHeader(); }
    catch(err){ toast("Archivo inválido"); }
  };
  reader.readAsText(file);
});

/* ---------- Charts helper ---------- */
const chartInstances = {};
function drawChart(canvasId, type, labels, datasets, pieLabels){
  const ctx = document.getElementById(canvasId);
  if(!ctx) return;
  if(chartInstances[canvasId]) chartInstances[canvasId].destroy();
  chartInstances[canvasId] = new Chart(ctx, {
    type, data:{ labels: type==='doughnut'? pieLabels : labels, datasets },
    options:{ responsive:true, plugins:{legend:{labels:{color:'#9497a6'}}}, scales: type==='doughnut'?{}:{ x:{ticks:{color:'#9497a6'}, grid:{color:'#2a2f3d'}}, y:{ticks:{color:'#9497a6'}, grid:{color:'#2a2f3d'}} } }
  });
}

/* ---------- Render all ---------- */
function renderAll(){
  renderHeader();
  const active = document.querySelector('.view.active');
  if(!active) return;
  const id = active.id.replace('view-','');
  if(id==='home') renderHome();
  else if(id==='food') renderFood();
  else if(id==='exercise') renderExercise();
  else if(id==='body') renderBody();
  else if(id==='books') renderBooks();
  else if(id==='rewards') renderRewards();
  else if(id==='settings') renderSettings();
}

/* ---------- Init ---------- */
window.addEventListener('load', ()=>{
  ensureDailyReset();
  showView('home');
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('sw.js').catch(()=>{});
  }
});
