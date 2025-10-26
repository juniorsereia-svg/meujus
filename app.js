/* =========================================================
   app.js — completo, NDJSON por shards + manifest
   ========================================================= */

/* Utilidades */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const byId = (id) => document.getElementById(id);

/* Ano no header e rodapé */
(() => {
  const y = String(new Date().getFullYear());
  const a = byId("ano"); if (a) a.textContent = y;
  const b = byId("rodapeAno"); if (b) b.textContent = `© ${y}`;
})();

/* ================== Fetch util: once + backoff ================== */
const __once = new Map();
async function fetchOnce(url, opt){
  const k = url + JSON.stringify(opt||{});
  if (__once.has(k)) return __once.get(k);
  const p = (async()=>{
    const res = await fetch(url, opt||{});
    if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
    const ct = res.headers.get("content-type")||"";
    return ct.includes("application/json") ? res.json() : res.text();
  })();
  __once.set(k, p);
  return p;
}
async function fetchWithBackoff(url, opt={}, tries=3, base=700){
  for (let i=0;i<tries;i++){
    const res = await fetch(url, opt);
    if (res.status !== 429) return res;
    await new Promise(r=>setTimeout(r, base*(i+1)));
  }
  throw new Error("429 repetido");
}

/* ================== NDJSON (JSONL) parser ================== */
async function parseNDJSONStream(response){
  if (!response.body || !response.body.getReader) {
    const txt = await response.text();
    return txt.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let { value, done } = await reader.read();
  let buf = value ? decoder.decode(value, {stream:true}) : "";
  const out = [];
  while (!done) {
    const lastNL = buf.lastIndexOf("\n");
    if (lastNL >= 0) {
      const chunk = buf.slice(0, lastNL);
      buf = buf.slice(lastNL+1);
      if (chunk) {
        const lines = chunk.split("\n");
        for (const ln of lines) if (ln.trim()) out.push(JSON.parse(ln));
      }
    }
    ({ value, done } = await reader.read());
    if (value) buf += decoder.decode(value, {stream:true});
  }
  if (buf.trim()) out.push(JSON.parse(buf.trim()));
  return out;
}

/* =========================================================
   Dados globais e manifesto
   ========================================================= */
const DATA = {
  manifest: null,             // {version, updatedAt, counts, shards, temas, subtemas}
  cursos: [],                 // [{value,label}]
  temas: [],                  // [{value,label}] — do manifest
  subtemas: [],               // [{value,label}] — do manifest
  banco: [],                  // questões carregadas do curso selecionado (shards)
};

const LOADED_CURSOS = new Map(); // curso -> { loaded:true, count:number }

/* Carrega manifesto uma única vez e popula listas de cursos/temas/subtemas */
async function ensureManifest(){
  if (DATA.manifest) return DATA.manifest;
  const manifest = await fetchOnce("./data/manifest.json", {cache:"force-cache"});
  DATA.manifest = manifest;

  // cursos a partir das chaves de shards
  const cursos = Object.keys(manifest.shards || {});
  DATA.cursos = cursos.sort().map(v=>({value:v,label:v}));

  // temas/subtemas globais do manifest
  DATA.temas = (manifest.temas || []).map(v=>({value:v,label:v}));
  DATA.subtemas = (manifest.subtemas || []).map(v=>({value:v,label:v}));

  return manifest;
}

/* Carrega shards do curso selecionado, memoizando por curso */
async function loadShardsForCurso(curso){
  if (!curso) { DATA.banco = []; return; }
  if (LOADED_CURSOS.get(curso)?.loaded) {
    // já carregado anteriormente
    return;
  }
  const manifest = await ensureManifest();
  const list = (manifest.shards && manifest.shards[curso]) || [];
  const agregadas = [];

  for (const url of list) {
    // usa once para evitar baixar duas vezes por navegação
    // e backoff para mitigar 429
    let res;
    const key = `__shard__${url}`;
    if (__once.has(key)) {
      const cached = await __once.get(key);
      agregadas.push(...cached);
      continue;
    }
    try {
      res = await fetchWithBackoff(`./${url.replace(/^\.?\//,'')}`, {cache:"force-cache"});
      if (!res.ok) throw new Error(res.status);
      const arr = await parseNDJSONStream(res);
      __once.set(key, Promise.resolve(arr));
      agregadas.push(...arr);
    } catch(e){
      console.warn("Shard não carregada:", url, e);
    }
  }

  // mantém apenas do curso alvo por segurança
  DATA.banco = agregadas.filter(q => q.curso === curso);

  LOADED_CURSOS.set(curso, {loaded:true, count:DATA.banco.length});
}

/* =========================================================
   Combo multisseleção estável (sem chips e sem contador)
   ========================================================= */
class Combo {
  constructor(cfg) {
    this.input   = byId(cfg.inputId);
    this.panel   = byId(cfg.panelId);
    this.hidden  = byId(cfg.hiddenId);
    this.multiple = cfg.multiple ?? true;
    this.headerText = cfg.header ?? "Busca rápida";

    this.root = cfg.rootId ? byId(cfg.rootId) : this.input.closest(".combo");
    this.control = $(".combo-control", this.root);
    this.caret   = $(".combo-caret", this.root);
    this.btnClose= $(".combo-close", this.root);

    const normalize = (x) =>
      typeof x === "string" ? ({ value:x, label:x })
      : ({ value:x.value, label:x.label ?? x.value });

    this.allOptions = (cfg.options ?? []).map(normalize);
    this.filtered   = this.allOptions.slice();
    this.valueSet   = new Set();
    this.focusIndex = -1;

    this._buildPanel();
    this._bind();
    this._render();
  }

  _buildPanel() {
    this.panel.innerHTML = "";

    const head = document.createElement("div");
    head.className = "combo-head";
    head.innerHTML = `<span>${this.headerText}</span>`;
    const searchWrap = document.createElement("div");
    searchWrap.className = "combo-search";
    searchWrap.innerHTML = `<input type="text" placeholder="Buscar…" aria-label="Buscar">`;
    head.appendChild(searchWrap);
    this.panel.appendChild(head);

    this.listEl = document.createElement("div");
    this.panel.appendChild(this.listEl);

    const foot = document.createElement("div");
    foot.className = "p-2 border-t border-zinc-100 flex items-center justify-between";
    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "text-xs px-2 py-1 rounded-md border border-zinc-200 hover:bg-zinc-50";
    clearBtn.textContent = "Limpar seleção";
    clearBtn.addEventListener("click", () => { this.clear(); });
    foot.appendChild(clearBtn);
    this.panel.appendChild(foot);

    this.searchInput = $("input", searchWrap);
    this.searchInput.addEventListener("input", () => {
      const q = this.searchInput.value.trim().toLowerCase();
      this.filtered = this.allOptions.filter(o => o.label.toLowerCase().includes(q));
      this.focusIndex = -1;
      this._paintList();
    });

    this.close();
  }

  _bind() {
    const open = () => this.open();
    const close = () => this.close();

    this.caret.addEventListener("click", open);
    this.input.addEventListener("focus", open);
    this.input.addEventListener("click", open);
    this.btnClose.addEventListener("click", close);

    document.addEventListener("click", (e) => {
      if (!this.root.contains(e.target)) this.close();
    });

    this.input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); this._move(1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); this._move(-1); }
      else if (e.key === "Enter")   { e.preventDefault(); this._toggleFocused(); }
      else if (e.key === "Escape")  { this.close(); }
    });

    this.panel.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); this._move(1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); this._move(-1); }
      else if (e.key === "Enter")   { e.preventDefault(); this._toggleFocused(); }
      else if (e.key === "Escape")  { this.close(); }
    });
  }

  open() {
    this.panel.classList.remove("hidden");
    this.searchInput?.focus();
    this._paintList();
  }
  close() {
    this.panel.classList.add("hidden");
    this.input.blur();
  }

  _move(dir) {
    if (!this.filtered.length) return;
    this.focusIndex = (this.focusIndex + dir + this.filtered.length) % this.filtered.length;
    this._highlightFocus();
  }
  _highlightFocus() {
    const items = $$(".combo-item", this.listEl);
    items.forEach(el => el.classList.remove("ring", "ring-offset-1", "ring-blue-200"));
    if (this.focusIndex >= 0 && items[this.focusIndex]) {
      const el = items[this.focusIndex];
      el.classList.add("ring","ring-offset-1","ring-blue-200");
      el.scrollIntoView({ block: "nearest" });
    }
  }
  _toggleFocused() {
    if (this.focusIndex < 0) return;
    const opt = this.filtered[this.focusIndex];
    this.toggle(opt.value);
  }

  _paintList() {
    this.listEl.innerHTML = "";
    this.listEl.setAttribute("role","listbox");
    this.filtered.forEach((o, idx) => {
      const item = document.createElement("div");
      item.className = "combo-item";
      item.setAttribute("role", "option");
      item.setAttribute("data-value", o.value);
      item.textContent = o.label;
      if (this.valueSet.has(o.value)) item.setAttribute("aria-selected", "true");
      item.addEventListener("click", () => { this.focusIndex = idx; this.toggle(o.value); });
      this.listEl.appendChild(item);
    });
    this._highlightFocus();
  }

  toggle(value) {
    if (this.valueSet.has(value)) this.valueSet.delete(value);
    else {
      if (!this.multiple) this.valueSet.clear();
      this.valueSet.add(value);
    }
    this._sync();
  }

  clear() {
    this.valueSet.clear();
    this._sync();
  }

  _sync() {
    const ordered = this.allOptions.map(o => o.value).filter(v => this.valueSet.has(v));
    if (this.hidden) this.hidden.value = JSON.stringify(ordered);

    // dispara evento para quem quiser ouvir mudanças
    this.root.dispatchEvent(new CustomEvent("combochange", {detail: ordered.slice()}));

    this._paintList();
  }

  setOptions(options) {
    const normalize = (x) =>
      typeof x === "string" ? ({ value:x, label:x })
      : ({ value:x.value, label:x.label ?? x.value });
    this.allOptions = (options ?? []).map(normalize);
    this.filtered = this.allOptions.slice();
    this.valueSet.clear();
    if (this.searchInput) this.searchInput.value = "";
    this._render();
  }

  setValue(values) {
    const arr = Array.isArray(values) ? values : [values];
    this.valueSet = new Set(arr);
    this._sync();
  }

  _render() {
    this._paintList();
    this._sync();
  }

  get value() {
    return Array.from(this.valueSet);
  }
}

/* =========================================================
   Combos: criados após manifesto
   ========================================================= */
let cursoCombo, temasCombo, subtemasCombo;

async function boot() {
  await ensureManifest();

  cursoCombo = new Combo({
    rootId:"cursoCombo",
    inputId:"cursoInput",
    panelId:"cursoPanel",
    hiddenId:"cursoHidden",
    multiple:false,
    header:"Busca rápida",
    options: DATA.cursos
  });

  temasCombo = new Combo({
    inputId:"temaInput",
    panelId:"temaPanel",
    hiddenId:"temasHidden",
    multiple:true,
    header:"Busca rápida",
    options: DATA.temas
  });

  subtemasCombo = new Combo({
    inputId:"subtemaInput",
    panelId:"subtemaPanel",
    hiddenId:"subtemasHidden",
    multiple:true,
    header:"Busca rápida",
    options: DATA.subtemas
  });

  // Quando curso mudar, carregue shards desse curso (lazy) e opcionalmente ajuste temas/subtemas disponíveis
  cursoCombo.root.addEventListener("combochange", async (e) => {
    const sel = e.detail; // array
    const curso = sel[0];
    if (!curso) { DATA.banco = []; return; }
    await loadShardsForCurso(curso);
    // Se quiser, podemos filtrar listas de temas/subtemas para os existentes no curso carregado:
    const tset = new Set(), sset = new Set();
    DATA.banco.forEach(q => {
      (q.temas||[]).forEach(t => tset.add(t));
      (q.subtemas||[]).forEach(s => sset.add(s));
    });
    temasCombo.setOptions(Array.from(tset).sort().map(v=>({value:v,label:v})));
    subtemasCombo.setOptions(Array.from(sset).sort().map(v=>({value:v,label:v})));
  });

  $$(".combo-caret").forEach(btn => btn.addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); btn.click(); }
  }));
}
document.addEventListener("DOMContentLoaded", boot);

/* =========================================================
   Banco e filtros
   ========================================================= */
function filtrarBanco({curso, temas, subtemas}) {
  if (!DATA.banco.length) return [];
  const temCurso = Array.isArray(curso) && curso.length;
  const temTemas = Array.isArray(temas) && temas.length;
  const temSubs  = Array.isArray(subtemas) && subtemas.length;

  return DATA.banco.filter(q => {
    if (temCurso && q.curso !== curso[0]) return false;
    if (temTemas && !q.temas?.some(t => temas.includes(t))) return false;
    if (temSubs  && !q.subtemas?.some(s => subtemas.includes(s))) return false;
    return true;
  });
}

function escolherDistintos(arr, n, usados = new Set()) {
  const pool = arr.filter(q => !usados.has(String(q.id)));
  const out = [];
  for (let i=0; i<n && pool.length; i++) {
    const k = Math.floor(Math.random() * pool.length);
    const q = pool.splice(k,1)[0];
    out.push(q);
    usados.add(String(q.id));
  }
  return out;
}

/* =========================================================
   Renderização de questões
   ========================================================= */
const previewVazio = byId("previewVazio");
const previewConteudo = byId("previewConteudo");
const artigo = byId("artigo");

function createQuestaoSection(q, idx) {
  const sec = document.createElement("section");
  sec.className = "questao";
  sec.setAttribute("data-qid", String(q.id));
  sec.setAttribute("data-qidx", String(idx));

  const h = document.createElement("h4");
  h.className = "titulo-questao";
  h.textContent = `Questão ${idx+1}`;
  sec.appendChild(h);

  const meta = document.createElement("div");
  meta.className = "meta";
  const temasTxt = (q.temas || []).join(", ");
  const subsTxt  = (q.subtemas || []).join(", ");
  meta.textContent = [q.curso, temasTxt, subsTxt].filter(Boolean).join(" • ");
  sec.appendChild(meta);

  const enun = document.createElement("div");
  enun.className = "enunciado";
  enun.textContent = q.enunciado || "(sem enunciado)";
  sec.appendChild(enun);

  if (Array.isArray(q.alternativas) && q.alternativas.length) {
    const ol = document.createElement("ol");
    ol.className = "alternativas";
    q.alternativas.forEach((alt) => {
      const li = document.createElement("li");
      li.textContent = alt;
      li.setAttribute("role","button");
      li.addEventListener("click", () => {
        if (li.getAttribute("aria-disabled")==="true") return;
        $$(".alternativas li", sec).forEach(n => n.setAttribute("aria-disabled","true"));
      });
      ol.appendChild(li);
    });
    sec.appendChild(ol);
  }

  const acoes = document.createElement("div");
  acoes.className = "acoes-ia";
  acoes.innerHTML = `
    <span class="ia-label">IA</span>
    <button type="button" class="btn-substituir" title="Substituir questão" aria-label="Substituir questão">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
        <path d="M21 12a9 9 0 0 1-9 9 9 9 0 0 1-9-9" stroke-width="2" stroke-linecap="round"/>
        <path d="M3 12a9 9 0 0 1 9-9 9 9 0 0 1 7.5 4.1" stroke-width="2" stroke-linecap="round"/>
        <path d="M3 4v8h8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>
  `;
  sec.appendChild(acoes);

  const sep = document.createElement("div");
  sep.className = "separador";
  sec.appendChild(sep);

  const btn = $(".btn-substituir", sec);
  if (btn) btn.addEventListener("click", () => substituirQuestao(idx));

  return sec;
}

function renderProva(questoes) {
  artigo.innerHTML = "";
  questoes.forEach((q, i) => artigo.appendChild(createQuestaoSection(q, i)));
  previewVazio.classList.add("hidden");
  previewConteudo.classList.remove("hidden");
}

function substituirQuestao(idx) {
  const curso = cursoCombo.value;
  const temas = temasCombo.value;
  const subtemas = subtemasCombo.value;

  const bancoFiltrado = filtrarBanco({curso, temas, subtemas});
  if (!bancoFiltrado.length) return;

  const sections = $$(".questao", artigo);
  const usados = new Set(sections.map(s => s.getAttribute("data-qid")));
  const atualSec = sections[idx];
  if (!atualSec) return;
  const atualId = atualSec.getAttribute("data-qid");
  if (atualId) usados.delete(atualId);

  const candidatos = bancoFiltrado.filter(q => !usados.has(String(q.id)));
  const novo = candidatos.length
    ? candidatos[Math.floor(Math.random()*candidatos.length)]
    : bancoFiltrado[Math.floor(Math.random()*bancoFiltrado.length)];
  if (!novo) return;

  const novaSec = createQuestaoSection(novo, idx);
  artigo.replaceChild(novaSec, atualSec);
}

/* =========================================================
   Formulário e ações globais
   ========================================================= */
const form = byId("formProva");

if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    await ensureManifest();

    const cursoSel = (JSON.parse(byId("cursoHidden").value||"[]")[0]) || cursoCombo.value[0];
    if (cursoSel) await loadShardsForCurso(cursoSel);

    const qtd = Math.max(1, Math.min(100, Number(byId("inpQtd").value || 10)));
    const curso = cursoSel ? [cursoSel] : cursoCombo.value;
    const temas = temasCombo.value;
    const subtemas = subtemasCombo.value;

    const bancoFiltrado = filtrarBanco({curso, temas, subtemas});
    if (!bancoFiltrado.length) {
      previewConteudo.classList.add("hidden");
      previewVazio.classList.remove("hidden");
      previewVazio.textContent = "Nenhuma prova gerada. Ajuste os filtros ou carregue shards no manifest.";
      return;
    }
    const usados = new Set();
    const qs = escolherDistintos(bancoFiltrado, qtd, usados);
    renderProva(qs);
  });
}

const btnLimpar = byId("btnLimpar");
if (btnLimpar) btnLimpar.addEventListener("click", () => {
  form.reset();
  cursoCombo.clear();
  temasCombo.clear();
  subtemasCombo.clear();
  previewConteudo.classList.add("hidden");
  previewVazio.classList.remove("hidden");
  previewVazio.textContent = "Nenhuma prova gerada.";
});

const btnImprimir = byId("btnImprimir");
if (btnImprimir) btnImprimir.addEventListener("click", () => window.print());

/* =========================================================
   Fim do arquivo
   ========================================================= */
