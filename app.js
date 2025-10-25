// Funcional: carrega manifest e TXT, parse, multiselect de temas com busca, amostragem estratificada, impressão 2 colunas.
(function () {
  const $ = (sel) => document.querySelector(sel);
  const ano = $('#ano'); const rodapeAno = $('#rodapeAno');
  [ano, rodapeAno].forEach(el => el && (el.textContent = new Date().getFullYear()));

  // Controles
  const selCurso = $('#selCurso');
  const inpQtd = $('#inpQtd');
  const form = $('#formProva');
  const btnLimpar = $('#btnLimpar');
  const btnImprimir = $('#btnImprimir');

  const temaInput = $('#temaInput');
  const temaPanel = $('#temaPanel');
  const temasHidden = $('#temasHidden');
  const chips = $('#chips');

  const previewVazio = $('#previewVazio');
  const previewConteudo = $('#previewConteudo');
  const artigo = $('#artigo');
  const printArticle = $('#printArticle');

  // Estado
  let banco = [];
  let temasDisponiveis = new Set();
  let temasSelecionados = new Set();
  let resultado = [];
  const letras = ['A','B','C','D','E'];

  // Utils
  function embaralhar(arr){for(let i=arr.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]];}return arr;}
  function normalizarPontuacao(txt){
    return txt.replace(/\s+([,.;:!?])/g,'$1').replace(/([(\[])\s+/g,'$1').replace(/\s{2,}/g,' ').replace(/\s*-\s*/g,' - ').trim();
  }
  function padronizarAlternativas(alts){
    return alts.slice(0,5).map((t,i)=>`${letras[i]}) ${t.replace(/^[A-Ea-e]\)\s*/, '').trim()}`);
  }

  // Parse TXT
 function parseArquivo(txt, curso) {
  const blocos = txt.split(/\n-{5,}\s*\n/).map(s=>s.trim()).filter(Boolean);
  const out = [];
  for (const b of blocos) {
    const linhas = b.split('\n').map(s=>s.trim()).filter(Boolean);
    if (!linhas.length) continue;

    const metaLinha = linhas.find(l=>l.startsWith('* '));
    const enunciadoLinhas = linhas.filter(l=>l.startsWith('** ')).map(l=>l.replace(/^\*\*\s*/,''));
    const alternativas = linhas.filter(l=>l.startsWith('*** ')).map(l=>l.replace(/^\*\*\*\s*/,''));
    const gabaritoLinha = linhas.find(l=>l.startsWith('**** '));
    const temaLinha = linhas.find(l=>l.startsWith('***** '));

    if (!metaLinha || !enunciadoLinhas.length || alternativas.length < 2 || !gabaritoLinha) continue;

    const meta = metaLinha.replace(/^\*\s*/,'').trim();
    const enunciado = normalizarPontuacao(enunciadoLinhas.join(' '));
    const alts = padronizarAlternativas(alternativas.map(a=>normalizarPontuacao(a)));
    const gab = (gabaritoLinha.replace(/^(\*{4}\s*)?Gabarito:\s*/i,'').trim().match(/^[A-E]/i)||[''])[0].toUpperCase();

    const temas = (temaLinha ? temaLinha.replace(/^\*{5}\s*/,'') : '')
      .split(',')
      .map(t=>t.trim())
      .filter(Boolean);

    temas.forEach(t=>temasDisponiveis.add(t));

    out.push({ curso, meta, enunciado, alternativas: alts, gabarito: gab, temas });
  }
  return out;
  }

  // Manifest + TXT
  async function carregarBanco() {
    const res = await fetch('./data/manifest.json');
    const manifest = await res.json();
    const cursos = Object.keys(manifest);
    selCurso.innerHTML = cursos.map(c=>`<option>${c}</option>`).join('');
    for(const curso of cursos){
      const folder = manifest[curso].folder;
      for(const f of manifest[curso].files){
        const txt = await fetch(`./data/${folder}/${f}`).then(r=>r.text());
        banco.push(...parseArquivo(txt, curso));
      }
    }
    montarComboTemas();
  }

  // Combo de temas com busca e multiseleção
  function montarComboTemas(){
    const lista = Array.from(temasDisponiveis).sort((a,b)=>a.localeCompare(b,'pt'));
    temaPanel.innerHTML = lista.map(t=>`<div class="combo-item" data-valor="${t}">${t}</div>`).join('');
  }
  function abrirPainel(){
    temaPanel.classList.remove('hidden');
  }
  function fecharPainel(){
    temaPanel.classList.add('hidden');
  }
  function renderChips(){
    chips.innerHTML = '';
    temasHidden.value = JSON.stringify(Array.from(temasSelecionados));
    temasSelecionados.forEach(t=>{
      const el = document.createElement('span');
      el.className = 'chip';
      el.innerHTML = `${t} <button type="button" aria-label="Remover">×</button>`;
      el.querySelector('button').onclick = ()=>{temasSelecionados.delete(t); renderChips();};
      chips.appendChild(el);
    });
  }
  temaInput.addEventListener('input', ()=>{
    const q = temaInput.value.trim().toLowerCase();
    Array.from(temaPanel.children).forEach(it=>{
      const ok = it.textContent.toLowerCase().includes(q);
      it.style.display = ok ? '' : 'none';
      it.setAttribute('aria-selected', ok ? 'true' : 'false');
    });
    abrirPainel();
  });
  temaInput.addEventListener('focus', abrirPainel);
  document.addEventListener('click', (e)=>{
    if(!temaPanel.contains(e.target) && e.target!==temaInput) fecharPainel();
  });
  temaPanel.addEventListener('click', (e)=>{
    const item = e.target.closest('.combo-item'); if(!item) return;
    const val = item.getAttribute('data-valor');
    temasSelecionados.add(val);
    renderChips();
    temaInput.value = '';
    fecharPainel();
  });

  // Filtro + amostragem estratificada por tema
  function filtrarPorCursoETemas(){
  const cursoAlvo = selCurso.value.trim();
  let pool = banco.filter(q=>q.curso === cursoAlvo);
  const selecionados = Array.from(temasSelecionados);
  if (!selecionados.length) return pool;
  return pool.filter(q => (q.temas && q.temas.some(t => selecionados.includes(t))));
}
  // Substitua sua função por esta versão com temas múltiplos e amostragem estratificada sem duplicar questões.
function amostrarEstratificada(pool, qtd) {
  // Temas selecionados pelo usuário, se existirem; caso contrário usa todos os temas encontrados no pool
  const selecionados = (typeof temasSelecionados !== 'undefined' && temasSelecionados.size)
    ? Array.from(temasSelecionados)
    : Array.from(new Set(pool.flatMap(q => (q.temas || []))));

  if (!selecionados.length) return embaralhar(pool.slice()).slice(0, qtd);

  // Buckets por tema selecionado
  const buckets = new Map();
  selecionados.forEach(t => buckets.set(t, []));
  pool.forEach(q => {
    const ts = q.temas || (q.tema ? [q.tema] : []);
    selecionados.forEach(t => { if (ts.includes(t)) buckets.get(t).push(q); });
  });
  // Embaralha cada bucket
  buckets.forEach((arr, t) => buckets.set(t, embaralhar(arr)));

  const usados = new Set(); // guarda referências de objetos já escolhidos
  const res = [];
  let i = 0;
  const ordem = selecionados.slice(); // round-robin pelos temas escolhidos

  while (res.length < qtd && buckets.size) {
    const tema = ordem[i % ordem.length];
    const arr = buckets.get(tema);

    if (arr && arr.length) {
      // pula itens já usados no topo
      while (arr.length && usados.has(arr[arr.length - 1])) arr.pop();
      if (arr.length) {
        const q = arr.pop();
        usados.add(q);
        res.push(q);
      } else {
        buckets.delete(tema);
      }
    } else {
      buckets.delete(tema);
    }
    i++;
  }

  // Completa com quaisquer remanescentes do pool sem duplicar
  if (res.length < qtd) {
    const resto = embaralhar(pool.filter(q => !usados.has(q)));
    res.push(...resto.slice(0, qtd - res.length));
  }

  return res.slice(0, qtd);
}

// Render da tela permanece igual; mantendo classes e estrutura atuais
function renderQuestoesTela(lista){
  const html = lista.map((q, idx)=>{
    const numero = idx+1;
    const alts = q.alternativas.map((a,i)=>`<li class="py-1" data-alt="${letras[i]}" role="button" tabindex="0">${a}</li>`).join('');
    return `
    <section class="questao py-2" data-q="${idx}">
      <div class="meta">${q.meta}</div>
      <h4 class="enunciado mt-1">${numero}) ${q.enunciado}</h4>
      <ul class="alternativas mt-2 space-y-1">${alts}</ul>
      <div class="feedback mt-2 text-sm"></div>
      <div class="separador"></div>
    </section>`;
  }).join('');
  artigo.innerHTML = html;
}

  // Render impressão: sem meta
  function renderQuestoesPrint(lista){
    const html = lista.map((q, idx)=>{
      const numero = idx+1;
      const alts = q.alternativas.map(a=>`<li class="py-1" style="font-size:0.825rem;line-height:1.5">${a}</li>`).join('');
      return `
      <section class="questao py-1" data-q="${idx}">
        <h4 class="enunciado mt-1" style="font-size:0.9rem;line-height:1.55;color:#111827;font-weight:400">${numero}) ${q.enunciado}</h4>
        <ul class="alternativas mt-2" style="margin-left:1rem">${alts}</ul>
        <div class="separador"></div>
      </section>`;
    }).join('');
    printArticle.innerHTML = html;
  }

  // Interação alternativas
  function onClickAlternativa(e){
    const li = e.target.closest('li[data-alt]'); if(!li) return;
    const sec = li.closest('section.questao'); if(!sec) return;
    if(sec.getAttribute('data-respondida')==='1') return;

    const idx = parseInt(sec.getAttribute('data-q'),10);
    const q = resultado[idx];
    const alt = li.getAttribute('data-alt');
    const correta = q.gabarito;

    sec.setAttribute('data-respondida','1');
    sec.querySelectorAll('.alternativas li').forEach(n=>n.setAttribute('aria-disabled','true'));

    const fb = sec.querySelector('.feedback');
    if(alt===correta){
      li.style.backgroundColor='rgba(16,185,129,0.15)';
      li.style.borderRadius='8px';
      fb.innerHTML=`<span class="inline-block rounded-md px-2 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700">Parabéns, você acertou. Gabarito: ${correta}</span>`;
    }else{
      li.style.backgroundColor='rgba(239,68,68,0.15)';
      li.style.borderRadius='8px';
      const right = Array.from(sec.querySelectorAll('.alternativas li')).find(n=>n.getAttribute('data-alt')===correta);
      if(right){right.style.outline='2px solid rgba(16,185,129,0.6)'; right.style.borderRadius='8px';}
      fb.innerHTML=`<span class="inline-block rounded-md px-2 py-1 bg-red-50 border border-red-200 text-red-700">Resposta incorreta. Gabarito: ${correta}</span>`;
    }
  }
  function onKeyAlternativa(e){
    if(e.key==='Enter'||e.key===' '){e.preventDefault(); onClickAlternativa(e);}
  }

  // Geração
  function gerar(){
    const pool = filtrarPorCursoETemas();
    if(!pool.length){
      previewConteudo.classList.add('hidden');
      previewVazio.classList.remove('hidden');
      artigo.innerHTML=''; printArticle.innerHTML='';
      return;
    }
    const qtd = Math.max(1, Math.min(parseInt(inpQtd.value||'1',10), 100));
    const lista = amostrarEstratificada(embaralhar(pool.slice()), qtd);
    resultado = lista;

    previewVazio.classList.add('hidden');
    previewConteudo.classList.remove('hidden');

    renderQuestoesTela(resultado);
    renderQuestoesPrint(resultado);

    window.scrollTo({ top: previewConteudo.offsetTop - 60, behavior:'smooth' });
  }

  // Eventos gerais
  form?.addEventListener('submit', (e)=>{e.preventDefault(); try{gerar();}catch(err){console.error(err); alert('Erro ao gerar prova.');}});
  btnLimpar?.addEventListener('click', ()=>{
    form.reset(); temasSelecionados.clear(); renderChips();
    resultado=[]; artigo.innerHTML=''; printArticle.innerHTML='';
    previewConteudo.classList.add('hidden'); previewVazio.classList.remove('hidden');
    window.scrollTo({ top:0, behavior:'smooth' });
  });
  btnImprimir?.addEventListener('click', ()=>window.print());
  document.addEventListener('click', onClickAlternativa);
  document.addEventListener('keydown', onKeyAlternativa);

  // Boot
  carregarBanco().catch(e=>{console.error(e); alert('Falha ao carregar banco de questões. Sirva via HTTP.');});
})();
