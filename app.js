/* =========================================================
   app.js — completo, da primeira à última linha
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

    /* raiz: usa id se veio, senão pega o .combo mais próximo do input */
    this.root = cfg.rootId ? byId(cfg.rootId) : this.input.closest(".combo");
    this.control = $(".combo-control", this.root);
    this.caret   = $(".combo-caret", this.root);
    this.btnClose= $(".combo-close", this.root);

    /* dados normalizados {value,label} */
    const normalize = (x) =>
      typeof x === "string" ? ({ value:x, label:x })
      : ({ value:x.value, label:x.label ?? x.value });

    this.allOptions = (cfg.options ?? []).map(normalize);  // ordem original
    this.filtered   = this.allOptions.slice();
    this.valueSet   = new Set();                           // valores selecionados
    this.focusIndex = -1;

    this._buildPanel();
    this._bind();
    this._render();
  }

  _buildPanel() {
    this.panel.innerHTML = "";

    /* Cabeçalho + busca */
    const head = document.createElement("div");
    head.className = "combo-head";
    head.innerHTML = `<span>${this.headerText}</span>`;
    const searchWrap = document.createElement("div");
    searchWrap.className = "combo-search";
    searchWrap.innerHTML = `<input type="text" placeholder="Buscar…" aria-label="Buscar">`;
    head.appendChild(searchWrap);
    this.panel.appendChild(head);

    /* Lista */
    this.listEl = document.createElement("div");
    this.panel.appendChild(this.listEl);

    /* Rodapé com limpar seleção */
    const foot = document.createElement("div");
    foot.className = "p-2 border-t border-zinc-100 flex items-center justify-between";
    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "text-xs px-2 py-1 rounded-md border border-zinc-200 hover:bg-zinc-50";
    clearBtn.textContent = "Limpar seleção";
    clearBtn.addEventListener("click", () => { this.clear(); });
    foot.appendChild(clearBtn);
    this.panel.appendChild(foot);

    /* Busca */
    this.searchInput = $("input", searchWrap);
    this.searchInput.addEventListener("input", () => {
      const q = this.searchInput.value.trim().toLowerCase();
      this.filtered = this.allOptions.filter(o => o.label.toLowerCase().includes(q));
      this.focusIndex = -1;
      this._paintList();
    });

    /* inicia fechado */
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

    /* teclado no input */
    this.input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); this._move(1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); this._move(-1); }
      else if (e.key === "Enter")   { e.preventDefault(); this._toggleFocused(); }
      else if (e.key === "Escape")  { this.close(); }
    });

    /* teclado no painel */
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
    /* serialização mantém ordem original da lista */
    const ordered = this.allOptions.map(o => o.value).filter(v => this.valueSet.has(v));
    if (this.hidden) this.hidden.value = JSON.stringify(ordered);
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
   Dados opcionais expostos em window
   ========================================================= */
const DATA = {
  cursos:    (window.DATA_CURSOS    || []).map(x => typeof x === "string" ? ({ value:x, label:x }) : x),
  temas:     (window.DATA_TEMAS     || []).map(x => typeof x === "string" ? ({ value:x, label:x }) : x),
  subtemas:  (window.DATA_SUBTEMAS  || []).map(x => typeof x === "string" ? ({ value:x, label:x }) : x),
  banco:     (window.BANCO_QUESTOES || []), // [{id,curso,temas:[...],subtemas:[...],enunciado,alternativas:[...],correta}]
};

/* =========================================================
   Instância dos combos
   ========================================================= */
const cursoCombo = new Combo({
  rootId:"cursoCombo",
  inputId:"cursoInput",
  panelId:"cursoPanel",
  hiddenId:"cursoHidden",
  multiple:false,
  header:"Busca rápida",
  options: DATA.cursos
});

const temasCombo = new Combo({
  inputId:"temaInput",
  panelId:"temaPanel",
  hiddenId:"temasHidden",
  multiple:true,
  header:"Busca rápida",
  options: DATA.temas
});

const subtemasCombo = new Combo({
  inputId:"subtemaInput",
  panelId:"subtemaPanel",
  hiddenId:"subtemasHidden",
  multiple:true,
  header:"Busca rápida",
  options: DATA.subtemas
});

/* Acessibilidade extra no caret */
$$(".combo-caret").forEach(btn => btn.addEventListener("keydown", e => {
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); btn.click(); }
}));

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

/* cria a seção de uma questão e retorna o elemento <section> */
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

  /* ações: substituir questão (SVG sem width/height inline) */
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

  /* bind do substituir da própria seção */
  const btn = $(".btn-substituir", sec);
  if (btn) btn.addEventListener("click", () => substituirQuestao(idx));

  return sec;
}

/* renderiza um conjunto completo de questões */
function renderProva(questoes) {
  artigo.innerHTML = "";
  questoes.forEach((q, i) => artigo.appendChild(createQuestaoSection(q, i)));
  previewVazio.classList.add("hidden");
  previewConteudo.classList.remove("hidden");
}

/* substitui apenas a questão na posição idx */
function substituirQuestao(idx) {
  const curso = cursoCombo.value;
  const temas = temasCombo.value;
  const subtemas = subtemasCombo.value;

  const bancoFiltrado = filtrarBanco({curso, temas, subtemas});
  if (!bancoFiltrado.length) return;

  /* ids já em uso no artigo, exceto o atual que será trocado */
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

  /* atualizar numeração e data-qidx das seguintes seções permanece igual */
}

/* =========================================================
   Formulário e ações globais
   ========================================================= */
const form = byId("formProva");

if (form) {
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const qtd = Math.max(1, Math.min(100, Number(byId("inpQtd").value || 10)));
    const curso = cursoCombo.value;
    const temas = temasCombo.value;
    const subtemas = subtemasCombo.value;

    const bancoFiltrado = filtrarBanco({curso, temas, subtemas});
    if (!bancoFiltrado.length) {
      previewConteudo.classList.add("hidden");
      previewVazio.classList.remove("hidden");
      previewVazio.textContent = "Nenhuma prova gerada. Carregue um banco local de questões em window.BANCO_QUESTOES.";
      return;
    }
    const usados = new Set();
    const qs = escolherDistintos(bancoFiltrado, qtd, usados);
    renderProva(qs);
  });
}

/* Limpar */
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

/* Imprimir */
const btnImprimir = byId("btnImprimir");
if (btnImprimir) btnImprimir.addEventListener("click", () => window.print());

/* =========================================================
   Fim do arquivo
   ========================================================= */
