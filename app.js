// Funcional: carrega manifest e TXT, parse, combos custom (curso/temas), amostragem estratificada,
// impressão 2 colunas, botões IA pós-gabarito e botão "substituir questão" por outra do mesmo arquivo/tema.
(function () {
  const $ = (sel) => document.querySelector(sel);
  const ano = $('#ano'); const rodapeAno = $('#rodapeAno');
  [ano, rodapeAno].forEach(el => el && (el.textContent = new Date().getFullYear()));

  // Controles
  const inpQtd = $('#inpQtd');
  const form = $('#formProva');
  const btnLimpar = $('#btnLimpar');
  const btnImprimir = $('#btnImprimir');

  // Curso: combo custom
  let cursoSelecionado = '';
  const cursoInput  = $('#cursoInput');
  const cursoPanel  = $('#cursoPanel');
  const cursoHidden = $('#cursoHidden');
  const cursoCaret  = document.querySelector('#cursoCombo .combo-caret');

  // Temas: combo + chips
  const temaInput = $('#temaInput');
  const temaPanel = $('#temaPanel');
  const temasHidden = $('#temasHidden');
  const chips = $('#chips');
  const temaCaret = document.querySelector('#temaInput')?.closest('.combo-control')?.querySelector('.combo-caret') || null;

  // Áreas
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

  // Índices p/ substituição
  const idxPorArquivo = new Map();     // chave: curso::tema::srcFile -> array de questões
  let usadosProva = new Set();         // ids já presentes na prova atual

  // Utils
  function embaralhar(arr){for(let i=arr.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]];}return arr;}
  function normalizarPontuacao(txt){
    return txt.replace(/\s+([,.;:!?])/g,'$1')
              .replace(/([(\[])\s+/g,'$1')
              .replace(/\s{2,}/g,' ')
              .replace(/\s*-\s*/g,' - ')
              .trim();
  }
  function padronizarAlternativas(alts){
    return alts.slice(0,5).map((t,i)=>`${letras[i]}) ${t.replace(/^[A-Ea-e]\)\s*/, '').trim()}`);
  }

  // Parse TXT (tema vem do nome do arquivo)
  function parseArquivo(txt, curso, temaLabel, srcFile) {
    const blocos = txt.split(/\n-{5,}\s*\n/).map(s=>s.trim()).filter(Boolean);
    const out = [];
    for (let idxBloco = 0; idxBloco < blocos.length; idxBloco++) {
      const b = blocos[idxBloco];
      const linhas = b.split('\n').map(s=>s.trim()).filter(Boolean);
      if (!linhas.length) continue;

      const metaLinha = linhas.find(l=>l.startsWith('* '));
      const enunciadoLinhas = linhas.filter(l=>l.startsWith('** ')).map(l=>l.replace(/^\*\*\s*/, ''));
      const alternativas = linhas.filter(l=>l.startsWith('*** ')).map(l=>l.replace(/^\*\*\*\s*/, ''));
      const gabaritoLinha = linhas.find(l=>l.startsWith('**** '));

      if (!metaLinha || !enunciadoLinhas.length || alternativas.length < 2 || !gabaritoLinha) continue;

      const meta = metaLinha.replace(/^\*\s*/, '').trim();
      const enunciado = normalizarPontuacao(enunciadoLinhas.join(' '));
      const alts = padronizarAlternativas(alternativas.map(a=>normalizarPontuacao(a)));
      const gab = (gabaritoLinha.replace(/^(\*{4}\s*)?Gabarito:\s*/i,'').trim().match(/^[A-E]/i)||[''])[0].toUpperCase();

      const id = `${curso}::${temaLabel}::${srcFile}::${idxBloco}`;
      const tema = temaLabel;
      const q = { id, curso, meta, enunciado, alternativas: alts, gabarito: gab, temas:[temaLabel], tema, srcFile };

      temasDisponiveis.add(temaLabel);
      out.push(q);
    }
    return out;
  }

  // Manifest + TXT
  async function carregarBanco() {
    const res = await fetch('./data/manifest.json');
    const manifest = await res.json();
    const cursos = Object.keys(manifest);

    montarComboCurso(cursos);

    function labelFromFilename(filename){
      const base = filename.replace(/\.[^.]+$/, '');
      const words = base.split(/[_\-]+/).filter(Boolean);
      return words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }

    for (const curso of cursos) {
      const folder = manifest[curso].folder;
      for (const f of manifest[curso].files) {
        const temaLabel = labelFromFilename(f);
        const txt = await fetch(`./data/${folder}/${f}`).then(r=>r.text());
        const lote = parseArquivo(txt, curso, temaLabel, f);
        banco.push(...lote);

        const chave = `${curso}::${temaLabel}::${f}`;
        if(!idxPorArquivo.has(chave)) idxPorArquivo.set(chave, []);
        idxPorArquivo.get(chave).push(...lote);
      }
    }

    montarComboTemas();
  }

  // Combo Curso
  function montarComboCurso(cursos){
    const lista = cursos.slice().sort((a,b)=>a.localeCompare(b,'pt'));
    cursoPanel.innerHTML = lista.map(c=>`<div class="combo-item" data-valor="${c}">${c}</div>`).join('');
    cursoSelecionado = lista[0] || '';
    cursoHidden.value = cursoSelecionado;
    cursoInput.value = cursoSelecionado;
  }
  function abrirPanelCurso(){ cursoPanel.classList.remove('hidden'); }
  function fecharPanelCurso(){ cursoPanel.classList.add('hidden'); }
  cursoInput?.addEventListener('focus', abrirPanelCurso);
  cursoCaret?.addEventListener('click', ()=> cursoPanel.classList.toggle('hidden'));
  cursoInput?.addEventListener('input', ()=>{
    const q = cursoInput.value.trim().toLowerCase();
    Array.from(cursoPanel.children).forEach(it=>{
      const ok = it.textContent.toLowerCase().includes(q);
      it.style.display = ok ? '' : 'none';
      it.setAttribute('aria-selected', ok ? 'true' : 'false');
    });
    abrirPanelCurso();
  });
  cursoPanel.addEventListener('click', (e)=>{
    const item = e.target.closest('.combo-item'); if(!item) return;
    cursoSelecionado = item.getAttribute('data-valor');
    cursoHidden.value = cursoSelecionado;
    cursoInput.value = cursoSelecionado;
    fecharPanelCurso();
  });
  document.addEventListener('click', (e)=>{
    if(!cursoPanel.contains(e.target) && e.target!==cursoInput && e.target!==cursoCaret) fecharPanelCurso();
  });

  // Combo Temas
  function montarComboTemas(){
    const lista = Array.from(temasDisponiveis).sort((a,b)=>a.localeCompare(b,'pt'));
    temaPanel.innerHTML = lista.map(t=>`<div class="combo-item" data-valor="${t}">${t}</div>`).join('');
  }
  function abrirPainel(){ temaPanel.classList.remove('hidden'); }
  function fecharPainel(){ temaPanel.classList.add('hidden'); }
  function renderChips(){
    chips.innerHTML = '';
    temasHidden.value = JSON.stringify(Array.from(temasSelecionados));
    temasSelecionados.forEach(t=>{
      const el = document.createElement('span');
      el.className = 'chip';
      el.innerHTML = `${t} <button type="button" aria-label="Remover">×</button>`;
      el.querySelector('button').onclick = ()=>{ temasSelecionados.delete(t); renderChips(); };
      chips.appendChild(el);
    });
  }
  temaInput?.addEventListener('input', ()=>{
    const q = temaInput.value.trim().toLowerCase();
    Array.from(temaPanel.children).forEach(it=>{
      const ok = it.textContent.toLowerCase().includes(q);
      it.style.display = ok ? '' : 'none';
      it.setAttribute('aria-selected', ok ? 'true' : 'false');
    });
    abrirPainel();
  });
  temaInput?.addEventListener('focus', abrirPainel);
  temaCaret?.addEventListener('click', ()=> temaPanel.classList.toggle('hidden'));
  document.addEventListener('click', (e)=>{
    if(!temaPanel.contains(e.target) && e.target!==temaInput && e.target!==temaCaret) fecharPainel();
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
    const cursoAlvo = (cursoSelecionado || '').trim();
    let pool = banco.filter(q=>q.curso === cursoAlvo);
    const selecionados = Array.from(temasSelecionados);
    if (!selecionados.length) return pool;
    return pool.filter(q => (q.temas && q.temas.some(t => selecionados.includes(t))));
  }

  function amostrarEstratificada(pool, qtd) {
    const selecionados = (temasSelecionados && temasSelecionados.size)
      ? Array.from(temasSelecionados)
      : Array.from(new Set(pool.flatMap(q => (q.temas || []))));
    if (!selecionados.length) return embaralhar(pool.slice()).slice(0, qtd);

    const buckets = new Map();
    selecionados.forEach(t => buckets.set(t, []));
    pool.forEach(q => {
      const ts = q.temas || [];
      selecionados.forEach(t => { if (ts.includes(t)) buckets.get(t).push(q); });
    });
    buckets.forEach((arr, t) => buckets.set(t, embaralhar(arr)));

    const usados = new Set();
    const res = [];
    let i = 0;
    const ordem = selecionados.slice();

    while (res.length < qtd && buckets.size) {
      const tema = ordem[i % ordem.length];
      const arr = buckets.get(tema);
      if (arr && arr.length) {
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

    if (res.length < qtd) {
      const resto = embaralhar(pool.filter(q => !usados.has(q)));
      res.push(...resto.slice(0, qtd - res.length));
    }
    return res.slice(0, qtd);
  }

  // IA: helpers e botões
  function formatarAlternativasParaPrompt(alts){
    return alts.map(s=>s.replace(/\s+/g,' ').trim()).join(' | ');
  }
  function urlGoogleModoIA(prompt){
    const base = 'https://www.google.com/search';
    const q = encodeURIComponent(prompt);
    return `${base}?hl=pt-BR&udm=50&q=${q}`;
  }
  function montarLinksIA(q){
    const enunciado  = q.enunciado.replace(/\s+/g,' ').trim();
    const alternativas = formatarAlternativasParaPrompt(q.alternativas);
    const gabarito   = q.gabarito;
    const temaPrincipal = (q.temas && q.temas.length ? q.temas.join(', ') : '');

    const pComentario =
`Comente e fundamente juridicamente a questão abaixo. Justifique por que o gabarito está correto e refute cada alternativa incorreta com base legal e, se possível, jurisprudência.
ENUNCIADO: "${enunciado}"
ALTERNATIVAS: "${alternativas}"
GABARITO: "${gabarito}"`;

    const pGlossario =
`Produza um glossário objetivo dos termos jurídicos presentes na questão abaixo. Defina cada termo em até 2 linhas e cite base legal quando aplicável.
ENUNCIADO: "${enunciado}"
ALTERNATIVAS: "${alternativas}"`;

    const pPrincipios =
`Identifique e explique os princípios do direito relacionados à questão abaixo, com referência a doutrina e artigos jurídicos. Resuma cada princípio e mostre a pertinência.
ENUNCIADO: "${enunciado}"
ALTERNATIVAS: "${alternativas}"
GABARITO: "${gabarito}"`;

    const pVideos =
`Liste 3 vídeos do YouTube que expliquem o tema principal desta questão de forma didática e atual. Dê título e link.
TEMA PRINCIPAL: "${temaPrincipal}"
ENUNCIADO: "${enunciado}"`;

    const hrefComentario = urlGoogleModoIA(pComentario);
    const hrefGlossario  = urlGoogleModoIA(pGlossario);
    const hrefPrincipios = urlGoogleModoIA(pPrincipios);
    const hrefVideos     = urlGoogleModoIA(pVideos);

    const icoComentario = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path d="M21 15a4 4 0 0 1-4 4H8l-5 4V5a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v10z"/>
      </svg>`;
    const icoGlossario = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14Z"/>
        <path d="M6.5 17V5.5A2.5 2.5 0 0 1 9 3"/>
      </svg>`;
    const icoPrincipios = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path d="M12 3v18M3 7h18"/>
        <path d="M7 7 3 13h8L7 7Z"/>
        <path d="M17 7l-4 6h8l-4-6Z"/>
      </svg>`;
    const icoVideos = `
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <polygon points="9,6 19,12 9,18"/>
        <rect x="3" y="5" width="18" height="14" rx="2" ry="2" fill="none" stroke="currentColor" stroke-width="2"/>
      </svg>`;

    return `
      <div class="acoes-ia">
        <span class="ia-label">Google I.A.</span>
        <a class="btn-ia" title="Comentário"  target="_blank" rel="noopener noreferrer" href="${hrefComentario}">${icoComentario}</a>
        <a class="btn-ia" title="Glossário"   target="_blank" rel="noopener noreferrer" href="${hrefGlossario}">${icoGlossario}</a>
        <a class="btn-ia" title="Princípios"  target="_blank" rel="noopener noreferrer" href="${hrefPrincipios}">${icoPrincipios}</a>
        <a class="btn-ia" title="Vídeos"      target="_blank" rel="noopener noreferrer" href="${hrefVideos}">${icoVideos}</a>
      </div>`;
  }

  // Substituição: utilitário
  function pickOutraDoMesmoArquivo(qAtual){
    const chave = `${qAtual.curso}::${qAtual.tema}::${qAtual.srcFile}`;
    const pool = idxPorArquivo.get(chave) || [];
    if(!pool.length) return null;
    for(let tent=0; tent<8; tent++){
      const cand = pool[(Math.random()*pool.length)|0];
      if(cand.id !== qAtual.id && !usadosProva.has(cand.id)) return cand;
    }
    const livre = pool.find(x=>x.id!==qAtual.id && !usadosProva.has(x.id));
    return livre || null;
  }

  // Render tela
  function renderQuestoesTela(lista){
    const html = lista.map((q, idx)=>{
      const numero = idx+1;
      const alts = q.alternativas.map((a,i)=>`<li class="py-1" data-alt="${letras[i]}" role="button" tabindex="0">${a}</li>`).join('');
      return `
      <section class="questao py-2" data-q="${idx}" data-id="${q.id}">
        <div class="titulo-questao">Questão ${numero}</div>
        <div class="meta">${q.meta}</div>
        <h4 class="enunciado mt-1">${q.enunciado}</h4>
        <ul class="alternativas mt-2 space-y-1">${alts}</ul>
        <div class="mt-2">
          <button type="button" class="btn-substituir" title="Trocar questão" aria-label="Trocar questão">↻</button>
        </div>
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
        <div class="titulo-questao" style="font-size:0.9rem;font-weight:600;color:#111827">Questão ${numero}</div>
        <h4 class="enunciado mt-1" style="font-size:0.9rem;line-height:1.55;color:#111827;font-weight:400">${q.enunciado}</h4>
        <ul class="alternativas mt-2" style="margin-left:1rem">${alts}</ul>
        <div class="separador"></div>
      </section>`;
    }).join('');
    printArticle.innerHTML = html;
  }

  // Interação: alternativas
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
    const trocar = sec.querySelector('.btn-substituir');
    if(trocar){ trocar.disabled = true; trocar.title = 'Questão já respondida'; }

    const fb = sec.querySelector('.feedback');
    if(alt===correta){
      li.style.backgroundColor='rgba(16,185,129,0.15)';
      li.style.borderRadius='8px';
      fb.innerHTML =
        `<span class="inline-block rounded-md px-2 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700">Parabéns, você acertou. Gabarito: ${correta}</span>` +
        montarLinksIA(q);
    }else{
      li.style.backgroundColor='rgba(239,68,68,0.15)';
      li.style.borderRadius='8px';
      const right = Array.from(sec.querySelectorAll('.alternativas li')).find(n=>n.getAttribute('data-alt')===correta);
      if(right){right.style.outline='2px solid rgba(16,185,129,0.6)'; right.style.borderRadius='8px';}
      fb.innerHTML =
        `<span class="inline-block rounded-md px-2 py-1 bg-red-50 border border-red-200 text-red-700">Resposta incorreta. Gabarito: ${correta}</span>` +
        montarLinksIA(q);
    }
  }
  function onKeyAlternativa(e){
    if(e.key==='Enter'||e.key===' '){e.preventDefault(); onClickAlternativa(e);}
  }

  // Interação: substituir questão
function onClickSubstituir(e){
  const btn = e.target.closest('.btn-substituir'); if(!btn) return;
  const sec = btn.closest('section.questao'); if(!sec) return;
  if(sec.getAttribute('data-respondida')==='1') return;

  const idx = parseInt(sec.getAttribute('data-q'),10);
  const atual = resultado[idx];
  const novo = pickOutraDoMesmoArquivo(atual);
  if(!novo){ btn.disabled = true; btn.title = 'Sem outras questões neste tema'; return; }

  // Atualiza estado
  usadosProva.delete(atual.id);
  usadosProva.add(novo.id);
  resultado[idx] = novo;

  // === TELA ===
  const altsTela = novo.alternativas
    .map((a,i)=>`<li class="py-1" data-alt="${letras[i]}" role="button" tabindex="0">${a}</li>`).join('');
  sec.setAttribute('data-id', novo.id);
  const hTitulo = sec.querySelector('.titulo-questao');
  const hEnun   = sec.querySelector('.enunciado');
  sec.querySelector('.meta').textContent = novo.meta;

  // Se existir "Questão X" separado, só troca o enunciado. Caso contrário, mantém numeração "idx+1)" no próprio enunciado.
  if (hTitulo) {
    hEnun.innerHTML = `${novo.enunciado}`;
  } else {
    hEnun.innerHTML = `${idx+1}) ${novo.enunciado}`;
  }

  sec.querySelector('.alternativas').innerHTML = altsTela;
  sec.querySelector('.feedback').innerHTML = '';

  // === IMPRESSÃO ===
  const secPrint = printArticle.querySelector(`.questao[data-q="${idx}"]`);
  if (secPrint) {
    const hEnunPrint = secPrint.querySelector('.enunciado');
    if (hEnunPrint) hEnunPrint.textContent = `${idx+1}) ${novo.enunciado}`;
    const ulPrint = secPrint.querySelector('.alternativas');
    if (ulPrint) {
      const altsPrint = novo.alternativas
        .map(a=>`<li class="py-1" style="font-size:0.825rem;line-height:1.5">${a}</li>`).join('');
      ulPrint.innerHTML = altsPrint;
    }
  }
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
  usadosProva = new Set(lista.map(q=>q.id));

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
document.addEventListener('click', onClickSubstituir);

// Boot
carregarBanco().catch(e=>{console.error(e); alert('Falha ao carregar banco de questões. Sirva via HTTP.');});
})(); 

