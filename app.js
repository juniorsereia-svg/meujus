// MeuJus — app.js (sem "trocar questão"; print render on demand)
(function () {
  const $ = (sel) => document.querySelector(sel);
  const ano = $('#ano'); const rodapeAno = $('#rodapeAno');
  [ano, rodapeAno].forEach(el => el && (el.textContent = new Date().getFullYear()));

  // Controles
  const form = $('#formProva');
  const btnLimpar = $('#btnLimpar');
  const btnImprimir = $('#btnImprimir');

  // Combos
  const cursoInput  = $('#cursoInput');
  const cursoPanel  = $('#cursoPanel');
  const cursoHidden = $('#cursoHidden');
  const cursoCaret  = document.querySelector('#cursoCombo .combo-caret');
  const cursoClose  = document.querySelector('#cursoCombo .combo-close');

  const temaInput   = $('#temaInput');
  const temaPanel   = $('#temaPanel');
  const temasHidden = $('#temasHidden');
  const temaCaret   = temaInput?.closest('.combo')?.querySelector('.combo-caret') || null;
  const temaClose   = temaInput?.closest('.combo')?.querySelector('.combo-close') || null;

  const provaSel    = $('#provaSel'); // opções são geradas dinamicamente

  // Áreas
  const previewVazio = $('#previewVazio');
  const previewConteudo = $('#previewConteudo');
  const artigo = $('#artigo');
  const printArticle = $('#printArticle');

  // Estado
  let manifest = {};
  let cursos = [];
  let cursoSelecionado = '';
  let temaSelecionado = '';
  let mapaTemasPorCurso = new Map(); // curso -> [{label, base, count?}]
  let resultado = [];
  const letras = ['A','B','C','D','E'];

  // Utils
  function ROOT_BASE(){
    return location.pathname.endsWith('/') ? location.pathname : location.pathname.replace(/[^/]+$/, '/');
  }
  function normalizarPontuacao(txt){
    return txt
      .replace(/\s+([,.;:?!])/g, '$1')
      .replace(/\(\s+/g, '(').replace(/\s+\)/g, ')')
      .replace(/\s{2,}/g,' ')
      .trim();
  }
  function padronizarAlternativas(v){
    const out = [];
    for (let i=0;i<v.length;i++){
      let s = v[i].trim();
      // Remove prefixos como "A) ", "(A) " etc.
      s = s.replace(/^\(?[A-E]\)?\s*[\)\.\-–—]?\s*/i,'').trim();
      out.push(s);
    }
    return out;
  }

  async function carregarTxt(url){
    const r = await fetch(url, { cache:'no-store' });
    if(!r.ok) throw new Error(`HTTP ${r.status} em ${url}`);
    return await r.text();
  }

  function parseQuestoesTxt({ curso, tema, srcFile, provaNum, base }, txt){
    const blocos = txt.replace(/\r\n/g,'\n').split(/\n-{5,}\s*\n/).map(s=>s.trim()).filter(Boolean);
    const out = [];
    for (let i=0;i<blocos.length;i++){
      const b = blocos[i];
      const linhas = b.split('\n').map(s=>s.trim()).filter(Boolean);
      if (!linhas.length) continue;

      const metaLinha = linhas.find(l=>l.startsWith('* '));
      const enunciadoLinhas = linhas.filter(l=>l.startsWith('** ')).map(l=>l.replace(/^\*\*\s*/, ''));
      const alternativas = linhas.filter(l=>l.startsWith('*** ')).map(l=>l.replace(/^\*\*\*\s*/, ''));
      const gabaritoLinha = linhas.find(l=>l.startsWith('**** '));
      if (!metaLinha || !enunciadoLinhas.length || alternativas.length < 2 || !gabaritoLinha) continue;

      const meta = metaLinha.replace(/^\*\s*/, '').trim();
      const enunciado = normalizarPontuacao(enunciadoLinhas.join(' '));
      const alts = padronizarAlternativas(alternativas.map(normalizarPontuacao));
      const gab = (gabaritoLinha.replace(/^(\*{4}\s*)?Gabarito:\s*/i,'').trim().match(/^[A-E]/i)||[''])[0].toUpperCase();

      out.push({
        id: `${curso}::${tema}::${srcFile}::P${provaNum}::Q${i+1}`,
        curso, tema, prova: provaNum, meta, enunciado, alternativas: alts, gabarito: gab, srcFile
      });
    }
    return out.slice(0,20);
  }

  // Manifest + combos
  async function carregarManifest() {
    const ROOT = ROOT_BASE();
    const ASSETS = ROOT + 'data/';
    const url = ASSETS + 'manifest.json';
    const r = await fetch(url, { cache:'no-store' });
    if(!r.ok) throw new Error(`HTTP ${r.status} ao buscar manifest`);
    manifest = await r.json();

    cursos = Object.keys(manifest||{}).sort((a,b)=>a.localeCompare(b,'pt'));

    // Combo curso
    montarComboCurso(cursos);

    // Combo tema
    cursoInput.addEventListener('change', onChangeCurso);
    temaInput?.addEventListener('change', onChangeTema);

    // Opções de prova/lista
    setOpcoesProva(10);

    // Eventos
    form?.addEventListener('submit', (e)=>{ e.preventDefault(); gerar(); });
    btnLimpar?.addEventListener('click', limpar);
    btnImprimir?.addEventListener('click', ()=>{
      // renderiza a versão de impressão apenas agora
      if (resultado.length) renderQuestoesPrint(resultado);
      window.print();
    });
    document.addEventListener('click', onClickAlternativa);
    document.addEventListener('keydown', onKeyAlternativa);
  }

  // Estimar número de provas disponíveis
  function setOpcoesProva(qtd){
    const opts = ['<option value="0">Aleatória (1–'+qtd+')</option>']
      .concat(Array.from({length:qtd},(_,i)=>`<option value="${i+1}">Lista ${i+1}</option>`));
    provaSel.innerHTML = opts.join('');
  }
  async function detectarQtdProvas(base){
    const infoCurso = manifest[cursoSelecionado];
    const temaEntry = (infoCurso?.temas||{})[temaSelecionado];
    const declarado = typeof temaEntry==='object' ? (temaEntry.count|0) : 0;
    if (declarado > 0) return Math.min(declarado, 10);

    const ROOT = ROOT_BASE(); const ASSETS = ROOT + 'data/';
    let qtd = 0;
    for (let i=1;i<=10;i++){
      const url = `${ASSETS}${base}/p${i}.txt`;
      try{
        const r = await fetch(url, { method:'HEAD', cache:'no-store' });
        if (r.ok) qtd = i; else break;
      } catch { break; }
    }
    return Math.max(qtd, 1);
  }
  function aquecerTema(base, count){
    try{
      if (!navigator.serviceWorker?.controller) return;
      navigator.serviceWorker.controller.postMessage({ type:'warmup', base, count });
    }catch{}
  }

  // Curso
  function montarComboCurso(listaCursos){
    cursoPanel.innerHTML = listaCursos.slice().sort((a,b)=>a.localeCompare(b,'pt'))
      .map(label=>`<div class="combo-item" data-value="${label}">${label}</div>`).join('');
    cursoPanel.addEventListener('click', (e)=>{
      const it = e.target.closest('.combo-item'); if(!it) return;
      cursoInput.value = it.textContent;
      cursoHidden.value = it.getAttribute('data-value');
      cursoSelecionado = it.getAttribute('data-value');
      // Montar temas
      montarTemasDoCurso(cursoSelecionado);
      // Fecha painel
      cursoPanel.classList.add('hidden');
    });
  }
  function montarTemasDoCurso(curso){
    const info = manifest[curso] || {};
    const temas = Object.keys(info.temas||{});
    mapaTemasPorCurso.set(curso, temas.map(t=>{
      const v = info.temas[t];
      const base = typeof v==='string' ? v : (v.base||t);
      const count = typeof v==='object' ? (v.count|0) : 0;
      return { label:t, base, count };
    }));
    temaPanel.innerHTML = mapaTemasPorCurso.get(curso)
      .map(({label})=>`<div class="combo-item" data-value="${label}">${label}</div>`).join('');
    temaPanel.addEventListener('click', onClickTema);
    temaInput.disabled = false;
  }
  function onClickTema(e){
    const it = e.target.closest('.combo-item'); if(!it) return;
    temaInput.value = it.textContent;
    temasHidden.value = it.getAttribute('data-value');
    temaSelecionado = it.getAttribute('data-value');
    fecharPainelTemas();
    // definir opções de prova a partir do tema
    const entry = (mapaTemasPorCurso.get(cursoSelecionado)||[]).find(x=>x.label===temaSelecionado);
    if(entry){
      const { base } = entry;
      (async()=>{
        const qtd = await detectarQtdProvas(base);
        setOpcoesProva(qtd);
        aquecerTema(base, qtd);
      })();
    }else{
      temaSelecionado = '';
      temasHidden.value = '';
      temaInput.value = '';
      setOpcoesProva(1);
    }
  }
  function abrirPainelTemas(){ temaPanel.classList.remove('hidden'); }
  function fecharPainelTemas(){ temaPanel.classList.add('hidden'); }
  temaInput?.addEventListener('focus', abrirPainelTemas);
  temaCaret?.addEventListener('click', ()=> temaPanel.classList.toggle('hidden'));
  temaClose?.addEventListener('click', ()=>{
    if(temaInput.value){
      temaInput.value = '';
      Array.from(temaPanel.children).forEach(it=>{ it.style.display=''; });
      abrirPainelTemas();
    } else fecharPainelTemas();
  });
  temaInput?.addEventListener('input', ()=>{
    const q = temaInput.value.trim().toLowerCase();
    Array.from(temaPanel.children).forEach(it=>{
      const ok = it.textContent.toLowerCase().includes(q);
      it.style.display = ok ? '' : 'none';
    });
    abrirPainelTemas();
  });

  async function onChangeCurso(){
    const v = cursoInput.value.trim();
    cursoSelecionado = v;
    const info = manifest[v] || {};
    if(!info?.temas){ temaInput.disabled = true; return; }
    montarTemasDoCurso(v);
  }
  async function onChangeTema(){
    // placeholder para compatibilidade
  }

  // Carregar provas
  async function carregarArquivoProva(curso, tema, provaNum){
    const infoCurso = manifest[curso];
    const temaEntry = (infoCurso?.temas||{})[tema];
    if (!temaEntry) throw new Error('Tema inválido');

    const base = typeof temaEntry==='string' ? temaEntry : (temaEntry.base||tema);
    const ROOT = ROOT_BASE(); const ASSETS = ROOT + 'data/';
    const srcFile = `${ASSETS}${base}/p${provaNum}.txt`;
    const txt = await carregarTxt(srcFile);
    return parseQuestoesTxt({ curso, tema, srcFile, provaNum, base }, txt);
  }

  function urlGoogleModoIA(prompt){
    const q = encodeURIComponent(prompt);
    return `https://www.google.com/search?q=${q}&udm=28&fbs=AEQNm0B`;
  }
  function montarLinksIA(q){
    const { enunciado, alternativas, gabarito } = q;
    const temaPrincipal = (q.meta||'').split(' - ')[0]||'';
    const pComentario =
`Explique de forma clara e objetiva o raciocínio para resolver esta questão, incluindo por que as alternativas incorretas estão erradas. Seja conciso, juridicamente correto e cite base legal quando necessário. Responda em português do Brasil.
ENUNCIADO: "${enunciado}"
ALTERNATIVAS: "${alternativas}"`;
    const pGlossario =
`Liste até 6 termos jurídicos essenciais para entender esta questão, com definições curtas e exemplos.
ENUNCIADO: "${enunciado}"
ALTERNATIVAS: "${alternativas}"`;
    const pPrincipios =
`Identifique e explique os princípios do direito relacionados à questão. Dê base legal quando aplicável.
ENUNCIADO: "${enunciado}"
ALTERNATIVAS: "${alternativas}"
GABARITO: "${gabarito}"`;
    const pVideos =
`Liste 3 vídeos do YouTube que expliquem o tema principal desta questão de forma didática e atual. Dê título e link.
TEMA PRINCIPAL: "${temaPrincipal}"
ENUNCIADO: "${enunciado}"`;
    const links = [
      { rotulo:'Comentário', href:urlGoogleModoIA(pComentario) },
      { rotulo:'Glossário',  href:urlGoogleModoIA(pGlossario)  },
      { rotulo:'Princípios', href:urlGoogleModoIA(pPrincipios) },
      { rotulo:'Vídeos',     href:urlGoogleModoIA(pVideos)     },
    ];
    return `<div class="acoes-ia">${links.map(l=>`<a class="btn-ia" target="_blank" rel="noopener" href="${l.href}" title="${l.rotulo}">${l.rotulo[0]}</a>`).join('')}</div>`;
  }

  // Render
  function renderEstoques(lista){ /* legado, não usado */ }
  function renderQuestoesTela(lista){
    const html = lista.map((q, idx)=>{
      const numero = idx+1;
      const alts = q.alternativas.map((a,i)=>`<li class="py-1" data-alt="${letras[i]}" role="button" tabindex="0">${a}</li>`).join('');
      return `
      <section class="questao py-2" data-q="${idx}" data-id="${q.id}">
        <div class="meta">${q.meta}</div>
        <h4 class="enunciado mt-1">${numero}) ${q.enunciado}</h4>
        <ul class="alternativas mt-2 space-y-1">${alts}</ul>
        <div class="feedback mt-2 text-sm"></div>
        <div class="separador"></div>
      </section>`;
    }).join('');
    artigo.innerHTML = html;
  }
  function renderQuestoesPrint(lista){
    const html = lista.map((q, idx)=>{
      const numero = idx+1;
      const alts = q.alternativas.map(a=>`<li class="py-1" style="font-size:0.825rem;line-height:1.5">${a}</li>`).join('');
      return `
      <section class="questao py-1" data-q="${idx}">
        <div class="meta">${q.meta}</div>
        <h4 class="enunciado mt-1" style="font-size:0.9rem;line-height:1.55;color:#111827;font-weight:400">${numero}) ${q.enunciado}</h4>
        <ul class="alternativas mt-2" style="margin-left:1rem">${alts}</ul>
        <div class="separador"></div>
      </section>`;
    }).join('');
    printArticle.innerHTML = html;
  }

  function onClickAlternativa(e){
    const li = e.target.closest('.alternativas li'); if(!li) return;
    const sec = li.closest('section.questao'); if(!sec) return;
    const idx = parseInt(sec.getAttribute('data-q'),10);
    const q = resultado[idx];
    if(!q) return;

    const alt = li.getAttribute('data-alt');
    const correta = q.gabarito;

    // desabilita cliques subsequentes
    sec.querySelectorAll('.alternativas li').forEach(n=>n.setAttribute('aria-disabled','true'));

    const fb = sec.querySelector('.feedback');
    if(alt===correta){
      li.style.backgroundColor='rgba(16,185,129,0.15)'; li.style.borderRadius='8px';
      fb.innerHTML = `<span class="inline-block rounded-md px-2 py-1">Correto, você acertou. Gabarito: ${correta}</span>` + montarLinksIA(q);
    }else{
      li.style.backgroundColor='rgba(239,68,68,0.15)'; li.style.borderRadius='8px';
      const right = Array.from(sec.querySelectorAll('.alternativas li')).find(n=>n.getAttribute('data-alt')===correta);
      if(right){right.style.outline='2px solid rgba(16,185,129,0.6)'; right.style.borderRadius='8px';}
      fb.innerHTML = `<span class="inline-block rounded-md px-2 py-1">Resposta incorreta. Gabarito: ${correta}</span>` + montarLinksIA(q);
    }
  }
  function onKeyAlternativa(e){
    if(e.key==='Enter'||e.key===' '){e.preventDefault(); onClickAlternativa(e);}
  }

  // Gerar
  async function gerar(){
    if(!cursoSelecionado || !temaSelecionado){ alert('Selecione disciplina e tema.'); return; }
    const totalOp = provaSel.options.length ? (provaSel.options.length - 1) : 10; // -1 por "Aleatória"
    let idxProva;
    const sel = parseInt(provaSel.value,10);
    if (sel===0 || isNaN(sel)){ idxProva = 1 + ((Math.random()*totalOp)|0); }
    else { idxProva = Math.max(1, Math.min(sel, totalOp)); }

    try{
      resultado = await carregarArquivoProva(cursoSelecionado, temaSelecionado, idxProva);
      if(!resultado.length){ throw new Error('Prova vazia ou inválida.'); }
      previewVazio.classList.add('hidden');
      previewConteudo.classList.remove('hidden');
      renderQuestoesTela(resultado);
    }catch(e){
      alert(`Erro: ${e.message}`);
    }
  }
  function limpar(){
    previewVazio.classList.remove('hidden');
    previewConteudo.classList.add('hidden');
    artigo.innerHTML = '';
    printArticle.innerHTML = '';
  }

  // Boot
  carregarManifest().catch(e=>{
    console.error(e);
    alert(`Falha ao carregar manifest:\n${e.message}\n\nVerifique /data/manifest.json e caminhos.`);
  });
})();

// === UI adjustments injetados pós-render ===
(function uiAdjustments(){
  // estilos extra
  const css = `
    .cabecalho-questao{display:flex;gap:.5rem;align-items:center;margin:.25rem 0 .5rem}
    .cabecalho-questao .meta{font-size:.85rem;color:#4b5563}
    .cabecalho-questao strong{font-weight:700}
    .separador{height:2px;background:linear-gradient(90deg,transparent,#cbd5e1,#cbd5e1,transparent);margin:1rem 0}
    .acoes-ia{display:flex;align-items:center;gap:.4rem;margin-top:.5rem}
    .acoes-ia::before{content:'Google I.A.';font-size:.775rem;color:#6b7280;margin-right:.25rem}
    .acoes-ia .btn-ia{display:inline-flex;align-items:center;justify-content:center;width:2rem;height:2rem;border:none;border-radius:.5rem;background:#f3f4f6;color:#111827;font-weight:600;text-decoration:none}
    /* Dropdowns minimalistas */
    .combo-panel{box-shadow:0 10px 20px rgba(0,0,0,.06);border:1px solid #e5e7eb;border-radius:.75rem}
    .combo-item{padding:.5rem .75rem;cursor:pointer}
    .combo-item:hover{background:#f9fafb}
    /* Mobile: mais largura útil */
    @media (max-width:640px){ main, .container, .layout{padding-inline:.75rem} }
    /* Print: ocultar metadados e destacar separador */
    @media print{ .questao .meta{display:none!important} .separador{height:2px;background:#9ca3af;margin:.6rem 0} }
  `;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  // remove "Escolher prova"
  Array.from(document.querySelectorAll('h1,h2,h3')).forEach(h=>{
    if(h.textContent.trim().toLowerCase()==='escolher prova') h.remove();
  });

  // rótulos e botão
  const provaLabel = document.querySelector('label[for="provaSel"]');
  if(provaLabel) provaLabel.textContent = 'Lista';
  const submit = document.querySelector('button[type="submit"],input[type="submit"]');
  if(submit) submit.textContent = 'Abrir';

  // opções "Prova X" -> "Lista X" (garantia extra)
  const sel = document.getElementById('provaSel');
  if(sel){
    const re = /^Prova\s+/i;
    const fix = ()=>Array.from(sel.options).forEach(o=>{ if(re.test(o.text)) o.text = o.text.replace(re, 'Lista '); });
    fix();
    sel.addEventListener('change', fix);
  }

  // fechar dropdowns ao selecionar
  const cursoPanel = document.getElementById('cursoPanel');
  const temaPanel  = document.getElementById('temaPanel');
  cursoPanel?.addEventListener('click', (e)=>{
    const it = e.target.closest('.combo-item'); if(!it) return;
    document.querySelector('#cursoCombo .combo-caret')?.click();
  });
  temaPanel?.addEventListener('click', (e)=>{
    const it = e.target.closest('.combo-item'); if(!it) return;
    temaPanel.classList.add('hidden');
  });

  // pós-processamento das questões para cabeçalho e numeração
  function formatMeta(html){
    return html.replace(/\b(Ano|Banca|Prova)\s*:/g,(m,p)=>`<strong>${p}</strong>:`);
  }
  function enhance(container){
    container.querySelectorAll('section.questao').forEach((sec, i)=>{
      if(sec.__enhanced) return;
      const meta = sec.querySelector('.meta');
      const h = sec.querySelector('.enunciado');
      if(h){ h.textContent = h.textContent.replace(/^\s*\d+\)\s*/,''); }
      const head = document.createElement('div');
      head.className = 'cabecalho-questao';
      head.innerHTML = `<strong>Questão ${i+1}</strong>` + (meta? ` <span class="meta">${formatMeta(meta.innerHTML)}</span>`:'');
      sec.insertBefore(head, sec.firstElementChild);
      if(meta) meta.remove();
      if(!sec.querySelector('.separador')){
        const sep = document.createElement('div'); sep.className='separador'; sec.appendChild(sep);
      }
      sec.__enhanced = true;
    });
  }
  const artigo = document.getElementById('artigo');
  const printArticle = document.getElementById('printArticle');
  if(artigo){
    const mo = new MutationObserver(()=>enhance(artigo));
    mo.observe(artigo, {childList:true, subtree:true});
  }
  if(printArticle){
    const mo2 = new MutationObserver(()=>enhance(printArticle));
    mo2.observe(printArticle, {childList:true, subtree:true});
  }
  if(artigo) setTimeout(()=>enhance(artigo), 200);
  if(printArticle) setTimeout(()=>enhance(printArticle), 200);
})();
