// Novo modelo: 1 disciplina → vários temas → 1 TXT por tema com 10 PROVAS pré-montadas (20 questões cada).
// O site carrega o TXT do tema escolhido e renderiza 1 prova (por nº ou aleatória).
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
  const temasHidden = $('#temasHidden'); // guarda tema selecionado como string
  const temaCaret   = temaInput?.closest('.combo')?.querySelector('.combo-caret') || null;
  const temaClose   = temaInput?.closest('.combo')?.querySelector('.combo-close') || null;

  const provaSel    = $('#provaSel'); // 0 = aleatória, 1..10 índices

  // Áreas
  const previewVazio = $('#previewVazio');
  const previewConteudo = $('#previewConteudo');
  const artigo = $('#artigo');
  const printArticle = $('#printArticle');

  // Estado
  let manifest = {};
  let cursos = [];                 // ['Direito Penal', ...]
  let cursoSelecionado = '';
  let temaSelecionado = '';
  let mapaTemasPorCurso = new Map(); // curso -> [{label, file, folder}]
  let provas = [];                 // Array<Prova> carregadas do TXT atual (tamanho 10)
  let resultado = [];              // questões da prova escolhida (20)
  const letras = ['A','B','C','D','E'];

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
  function labelFromFilename(filename){
    const base = filename.replace(/\.[^.]+$/, '');
    const words = base.split(/[_\-]+/).filter(Boolean);
    return words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }
  function ROOT_BASE(){
    return location.pathname.endsWith('/') ? location.pathname : location.pathname.replace(/[^/]+$/, '/');
  }

  // Parser de TXT no novo formato:
  // Nível 1 (PROVAS): linha com 5+ sinais de "=" entre blocos.
  // Nível 2 (QUESTÕES): linha com 5+ sinais de "-" entre blocos.
  // Em cada questão:
  //   * meta
  //   ** enunciado (1+ linhas)
  //   *** alternativas (2-5)
  //   **** Gabarito: X
  function parseTXT_Provas(txt, curso, tema, srcFile){
    const splitProvas = txt.split(/\n={5,}\s*\n/).map(s=>s.trim()).filter(Boolean);
    const outProvas = [];
    for(let iProva=0;iProva<splitProvas.length;iProva++){
      const blocoProva = splitProvas[iProva];
      const blocosQuestoes = blocoProva.split(/\n-{5,}\s*\n/).map(s=>s.trim()).filter(Boolean);
      const questoes = [];
      for (let idxBloco=0; idxBloco<blocosQuestoes.length; idxBloco++){
        const b = blocosQuestoes[idxBloco];
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

        const id = `${curso}::${tema}::${srcFile}::P${iProva+1}::Q${idxBloco+1}`;
        questoes.push({ id, curso, tema, prova:iProva+1, meta, enunciado, alternativas:alts, gabarito:gab, srcFile });
      }
      if (questoes.length) outProvas.push(questoes);
    }
    return outProvas;
  }

  // Manifest + combos
  async function carregarManifest() {
    const ROOT = ROOT_BASE();
    const ASSETS = ROOT + 'data/';
    const url = ASSETS + 'manifest.json';
    const r = await fetch(url, { cache:'no-store' });
    if(!r.ok) throw new Error(`HTTP ${r.status} ao buscar ${url}`);
    manifest = await r.json();

    cursos = Object.keys(manifest);
    montarComboCurso(cursos);

    // Construir mapa curso -> temas
    mapaTemasPorCurso.clear();
    for(const curso of cursos){
      const folder = manifest[curso].folder;
      const temasObj = manifest[curso].temas || {};
      const temas = Object.keys(temasObj).map(label=>{
        const file = typeof temasObj[label] === 'string' ? temasObj[label] : temasObj[label].file;
        return { label, file, folder };
      }).sort((a,b)=>a.label.localeCompare(b.label,'pt'));
      mapaTemasPorCurso.set(curso, temas);
    }
    montarComboTemas();
  }

  // Carregar TXT do tema selecionado quando for gerar
  async function carregarTXTDoTema(curso, tema){
    const infoCurso = manifest[curso];
    if(!infoCurso) throw new Error('Disciplina inválida.');
    const temaEntry = (infoCurso.temas||{})[tema];
    const file = typeof temaEntry === 'string' ? temaEntry : temaEntry?.file;
    if(!file) throw new Error('Tema inválido.');
    const folder = infoCurso.folder;

    const ROOT = ROOT_BASE();
    const ASSETS = ROOT + 'data/';
    const url = `${ASSETS}${folder}/${file}`;
    const r = await fetch(url, { cache:'no-store' });
    if(!r.ok) throw new Error(`HTTP ${r.status} ao buscar ${url}`);
    const txt = await r.text();
    const parsed = parseTXT_Provas(txt, curso, tema, file);
    if(!parsed.length) throw new Error('Nenhuma prova válida no TXT.');
    provas = parsed; // array de provas; cada prova é array de questões
  }

  // Curso
  function montarComboCurso(listaCursos){
    cursoPanel.innerHTML = listaCursos.slice().sort((a,b)=>a.localeCompare(b,'pt'))
      .map(c=>`<div class="combo-item" data-valor="${c}">${c}</div>`).join('');
    cursoSelecionado = listaCursos[0] || '';
    cursoHidden.value = cursoSelecionado;
    cursoInput.value = cursoSelecionado;
  }
  function abrirPanelCurso(){ cursoPanel.classList.remove('hidden'); }
  function fecharPanelCurso(){ cursoPanel.classList.add('hidden'); }

  cursoInput?.addEventListener('focus', abrirPanelCurso);
  cursoCaret?.addEventListener('click', ()=> cursoPanel.classList.toggle('hidden'));
  cursoClose?.addEventListener('click', ()=>{
    if(cursoInput.value && cursoInput.value !== cursoSelecionado){
      cursoInput.value = '';
      Array.from(cursoPanel.children).forEach(it=>{ it.style.display=''; });
      abrirPanelCurso();
    } else fecharPanelCurso();
  });
  cursoInput?.addEventListener('input', ()=>{
    const q = cursoInput.value.trim().toLowerCase();
    Array.from(cursoPanel.children).forEach(it=>{
      const ok = it.textContent.toLowerCase().includes(q);
      it.style.display = ok ? '' : 'none';
    });
    abrirPanelCurso();
  });
  cursoPanel.addEventListener('click', (e)=>{
    const item = e.target.closest('.combo-item'); if(!item) return;
    cursoSelecionado = item.getAttribute('data-valor');
    cursoHidden.value = cursoSelecionado;
    cursoInput.value = cursoSelecionado;
    fecharPanelCurso();
    montarComboTemas(); // recarrega lista de temas do curso
  });
  document.addEventListener('click', (e)=>{
    if(!cursoPanel.contains(e.target) && e.target!==cursoInput && e.target!==cursoCaret && e.target!==cursoClose) fecharPanelCurso();
  });

  // Tema
  function montarComboTemas(){
    const temas = mapaTemasPorCurso.get(cursoSelecionado) || [];
    temaPanel.innerHTML = temas.map(t=>`<div class="combo-item" data-valor="${t.label}">${t.label}</div>`).join('');
    // autoseleciona primeiro
    if(temas.length){
      temaSelecionado = temas[0].label;
      temasHidden.value = temaSelecionado;
      temaInput.value = temaSelecionado;
    }else{
      temaSelecionado = '';
      temasHidden.value = '';
      temaInput.value = '';
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
  temaPanel.addEventListener('click', (e)=>{
    const item = e.target.closest('.combo-item'); if(!item) return;
    temaSelecionado = item.getAttribute('data-valor');
    temasHidden.value = temaSelecionado;
    temaInput.value = temaSelecionado;
    fecharPainelTemas();
  });
  document.addEventListener('click', (e)=>{
    if(!temaPanel.contains(e.target) && e.target!==temaInput && e.target!==temaCaret && e.target!==temaClose) fecharPainelTemas();
  });

  // IA
  function formatarAlternativasParaPrompt(alts){
    return alts.map(s=>s.replace(/\s+/g,' ').trim()).join(' | ');
  }
  function urlGoogleModoIA(prompt){
    const base = 'https://www.google.com/search';
    const q = encodeURIComponent(prompt);
    return `${base}?hl=pt-BR&udm=50&q=${q}`;
  }
  function montarLinksIA(q){
    const enunciado = q.enunciado.replace(/\s+/g,' ').trim();
    const alternativas = formatarAlternativasParaPrompt(q.alternativas);
    const gabarito = q.gabarito;
    const temaPrincipal = q.tema || '';

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

    const links = [
      { rotulo:'Comentário', href:urlGoogleModoIA(pComentario) },
      { rotulo:'Glossário',  href:urlGoogleModoIA(pGlossario)  },
      { rotulo:'Princípios', href:urlGoogleModoIA(pPrincipios) },
      { rotulo:'Vídeos',     href:urlGoogleModoIA(pVideos)     },
    ];

    return `<div class="acoes-ia">${
      links.map(l=>`<a class="btn-ia" target="_blank" rel="noopener" href="${l.href}" title="${l.rotulo}">${l.rotulo[0]}</a>`).join('')
    }</div>`;
  }

  // Substituir questão: troca pela MESMA POSIÇÃO em outra prova do MESMO TXT
  function substituirQuestaoMesmoPos(idxQuestao){
    if(!Array.isArray(provas) || provas.length===0) return null;
    const nQuestoes = resultado.length;
    const pos = idxQuestao; // 0..19
    const outras = provas.filter(p => p.length===nQuestoes); // sanidade
    if(!outras.length) return null;

    // tente até 8 amostras
    for(let t=0;t<8;t++){
      const candProva = outras[(Math.random()*outras.length)|0];
      const cand = candProva[pos];
      if(cand && cand.id !== resultado[pos].id) return cand;
    }
    // fallback varrendo
    for(const p of outras){
      const cand = p[pos];
      if(cand && cand.id !== resultado[pos].id) return cand;
    }
    return null;
  }

  // Render tela
  function renderQuestoesTela(lista){
    const html = lista.map((q, idx)=>{
      const numero = idx+1;
      const alts = q.alternativas.map((a,i)=>`<li class="py-1" data-alt="${letras[i]}" role="button" tabindex="0">${a}</li>`).join('');
      return `
      <section class="questao py-2" data-q="${idx}" data-id="${q.id}">
        <div class="meta">${q.meta}</div>
        <h4 class="enunciado mt-1">${numero}) ${q.enunciado}</h4>
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

  // Render impressão
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
    const novo = substituirQuestaoMesmoPos(idx);
    if(!novo){ btn.disabled = true; btn.title = 'Sem alternativa para esta posição em outras provas'; return; }

    resultado[idx] = novo;
    const alts = novo.alternativas.map((a,i)=>`<li class="py-1" data-alt="${letras[i]}" role="button" tabindex="0">${a}</li>`).join('');
    sec.setAttribute('data-id', novo.id);
    sec.querySelector('.meta').textContent = novo.meta;
    sec.querySelector('.enunciado').innerHTML = `${idx+1}) ${novo.enunciado}`;
    sec.querySelector('.alternativas').innerHTML = alts;
    sec.querySelector('.feedback').innerHTML = '';
  }

  // Gerar prova
  async function gerar(){
    if(!cursoSelecionado || !temaSelecionado){
      alert('Selecione disciplina e tema.'); return;
    }
    try{
      await carregarTXTDoTema(cursoSelecionado, temaSelecionado);

      // escolher prova
      let idxProva;
      const sel = parseInt(provaSel.value,10); // 0=aleatória
      if (sel===0){
        idxProva = Math.min( (Math.random()*provas.length)|0 , provas.length-1 );
      } else {
        idxProva = Math.max(0, Math.min(sel-1, provas.length-1));
      }

      const prova = provas[idxProva];
      // garante 20 questões: se houver mais, usa 20 primeiras; se menos, usa todas
      resultado = prova.slice(0, 20);

      previewVazio.classList.add('hidden');
      previewConteudo.classList.remove('hidden');

      renderQuestoesTela(resultado);
      renderQuestoesPrint(resultado);

      window.scrollTo({ top: previewConteudo.offsetTop - 60, behavior:'smooth' });
    }catch(err){
      console.error(err);
      alert(`Erro ao gerar prova:\n${err.message}`);
    }
  }

  // Eventos
  form?.addEventListener('submit', (e)=>{e.preventDefault(); gerar();});

  btnLimpar?.addEventListener('click', ()=>{
    form.reset();
    // reset combos
    if(cursos.length){
      cursoSelecionado = cursos[0];
      cursoHidden.value = cursoSelecionado;
      cursoInput.value = cursoSelecionado;
      montarComboTemas();
    } else {
      cursoSelecionado=''; cursoHidden.value=''; cursoInput.value='';
      temaSelecionado=''; temasHidden.value=''; temaInput.value='';
    }
    resultado=[]; artigo.innerHTML=''; printArticle.innerHTML='';
    previewConteudo.classList.add('hidden'); previewVazio.classList.remove('hidden');
    window.scrollTo({ top:0, behavior:'smooth' });
  });

  btnImprimir?.addEventListener('click', ()=>window.print());
  document.addEventListener('click', onClickAlternativa);
  document.addEventListener('keydown', onKeyAlternativa);
  document.addEventListener('click', onClickSubstituir);

  // Boot
  carregarManifest().catch(e=>{
    console.error(e);
    alert(`Falha ao carregar manifest:\n${e.message}\n\nVerifique /data/manifest.json e caminhos.`);
  });
})();
