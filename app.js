// Site funcional: carrega /data/manifest.json e TXT, faz parse e gera prova interativa.
(function () {
  const $ = (sel) => document.querySelector(sel);
  const ano = $('#ano'); const rodapeAno = $('#rodapeAno');
  [ano, rodapeAno].forEach(el => el && (el.textContent = new Date().getFullYear()));

  // Controles
  const selCurso = $('#selCurso');
  const inpTemas = $('#inpTemas');
  const inpQtd = $('#inpQtd');
  const form = $('#formProva');
  const btnLimpar = $('#btnLimpar');
  const btnImprimir = $('#btnImprimir');

  const previewVazio = $('#previewVazio');
  const previewConteudo = $('#previewConteudo');
  const artigo = $('#artigo');
  const artigoImpressao = $('#artigoImpressao');

  // Estado
  let banco = [];         // banco total
  let resultado = [];     // questões escolhidas para a prova
  const letras = ['A','B','C','D','E'];

  // Utilitários
  function embaralhar(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  function normalizarPontuacao(txt) {
    return txt
      .replace(/\s+([,.;:!?])/g, '$1')
      .replace(/([(\[])\s+/g, '$1')
      .replace(/\s{2,}/g, ' ')
      .replace(/\s*-\s*/g, ' - ')
      .trim();
  }
  function padronizarAlternativas(alts) {
    return alts.slice(0,5).map((t,i)=>{
      const sem = t.replace(/^[A-Ea-e]\)\s*/, '').trim();
      return `${letras[i]}) ${sem}`;
    });
  }

  // Parse TXT com marcadores: * meta, ** enunciado, *** alternativas, **** gabarito, ***** tema, ****** disciplina
  function parseArquivo(txt, curso) {
    const blocos = txt.split(/\n-{5,}\s*\n/).map(s => s.trim()).filter(Boolean);
    const out = [];
    for (const b of blocos) {
      const linhas = b.split('\n').map(s => s.trim()).filter(Boolean);
      if (!linhas.length) continue;

      const metaLinha = linhas.find(l => l.startsWith('* '));
      const enunciadoLinhas = linhas.filter(l => l.startsWith('** ')).map(l => l.replace(/^\*\*\s*/, ''));
      const alternativas = linhas.filter(l => l.startsWith('*** ')).map(l => l.replace(/^\*\*\*\s*/, ''));
      const gabaritoLinha = linhas.find(l => l.startsWith('**** '));
      const temaLinha = linhas.find(l => l.startsWith('***** '));
      const discLinha = linhas.find(l => l.startsWith('****** '));

      if (!metaLinha || !enunciadoLinhas.length || alternativas.length < 2 || !gabaritoLinha) continue;

      const meta = metaLinha.replace(/^\*\s*/, '').trim();
      const enunciado = normalizarPontuacao(enunciadoLinhas.join(' '));
      const alts = padronizarAlternativas(alternativas.map(a => normalizarPontuacao(a)));
      const gab = (gabaritoLinha.replace(/^(\*{4}\s*)?Gabarito:\s*/i,'').trim().match(/^[A-E]/i)||[''])[0].toUpperCase();
      const tema = temaLinha ? temaLinha.replace(/^\*{5}\s*/, '').trim() : '';
      const disciplina = discLinha ? discLinha.replace(/^\*{6}\s*/, '').trim() : '';

      out.push({ curso, meta, enunciado, alternativas: alts, gabarito: gab, tema, disciplina });
    }
    return out;
  }

  // Carregar manifest e textos
  async function carregarBanco() {
    const res = await fetch('./data/manifest.json');
    const manifest = await res.json();
    const cursos = Object.keys(manifest);
    selCurso.innerHTML = cursos.map(c => `<option>${c}</option>`).join('');
    for (const curso of cursos) {
      const folder = manifest[curso].folder;
      for (const f of manifest[curso].files) {
        const txt = await fetch(`./data/${folder}/${f}`).then(r => r.text());
        banco.push(...parseArquivo(txt, curso));
      }
    }
  }

  function filtrar() {
    const cursoAlvo = selCurso.value.trim();
    const temas = inpTemas.value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    let pool = banco.filter(q => q.curso === cursoAlvo);
    if (temas.length) pool = pool.filter(q => temas.some(t => (q.tema||'').toLowerCase().includes(t)));
    return pool;
  }

  // Renderização
  function renderQuestoes(lista, destino) {
    const html = lista.map((q, idx) => {
      const numero = idx + 1;
      const alts = q.alternativas.map((a,i)=>`<li class="py-1 text-[0.975rem]" data-alt="${letras[i]}" role="button" tabindex="0">${a}</li>`).join('');
      return `
      <section class="questao py-2" data-q="${idx}">
        <div class="meta">${q.meta}</div>
        <h4 class="enunciado mt-1 text-[1.05rem]">${numero}) ${q.enunciado}</h4>
        <ul class="alternativas mt-2 space-y-1">${alts}</ul>
        <div class="feedback mt-2 text-sm"></div>
        <div class="separador"></div>
      </section>`;
    }).join('');
    destino.innerHTML = html;
  }

  function gerar() {
    const pool = filtrar();
    if (!pool.length) {
      previewConteudo.classList.add('hidden');
      previewVazio.classList.remove('hidden');
      artigo.innerHTML = '';
      artigoImpressao.innerHTML = '';
      artigoImpressao.classList.add('hidden');
      return;
    }
    const qtd = Math.max(1, Math.min(parseInt(inpQtd.value||'1',10), 100));
    const lista = embaralhar(pool.slice()).slice(0, qtd); // sempre embaralhar
    resultado = lista;

    previewVazio.classList.add('hidden');
    previewConteudo.classList.remove('hidden');
    renderQuestoes(resultado, artigo);

    // mesmo conteúdo para impressão em 2 colunas
    artigoImpressao.classList.remove('hidden');
    renderQuestoes(resultado, artigoImpressao);
    window.scrollTo({ top: previewConteudo.offsetTop - 60, behavior: 'smooth' });
  }

  // Interação das alternativas: colorir e mostrar gabarito somente após resposta
  function onClickAlternativa(e) {
    const li = e.target.closest('li[data-alt]');
    if (!li) return;
    const sec = li.closest('section.questao');
    if (!sec) return;
    if (sec.getAttribute('data-respondida') === '1') return; // trava após responder

    const idx = parseInt(sec.getAttribute('data-q'), 10);
    const q = resultado[idx];
    const selecionada = li.getAttribute('data-alt');
    const correta = q.gabarito;

    // bloqueia interação
    sec.setAttribute('data-respondida', '1');
    sec.querySelectorAll('.alternativas li').forEach(n => n.setAttribute('aria-disabled','true'));

    const feedback = sec.querySelector('.feedback');
    // marca cores
    if (selecionada === correta) {
      li.style.backgroundColor = 'rgba(16,185,129,0.15)'; // verde claro
      li.style.borderRadius = '8px';
      feedback.innerHTML = `<span class="inline-block rounded-md px-2 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700">Parabéns, você acertou. Gabarito: ${correta}</span>`;
    } else {
      li.style.backgroundColor = 'rgba(239,68,68,0.15)'; // vermelho claro
      li.style.borderRadius = '8px';
      // destaca também a correta sutilmente
      const corretaEl = Array.from(sec.querySelectorAll('.alternativas li')).find(n => n.getAttribute('data-alt') === correta);
      if (corretaEl) {
        corretaEl.style.outline = '2px solid rgba(16,185,129,0.6)';
        corretaEl.style.borderRadius = '8px';
      }
      feedback.innerHTML = `<span class="inline-block rounded-md px-2 py-1 bg-red-50 border border-red-200 text-red-700">Resposta incorreta. Gabarito: ${correta}</span>`;
    }
  }

  function onKeyAlternativa(e){
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClickAlternativa(e);
    }
  }

  // Eventos
  form?.addEventListener('submit', (e) => { e.preventDefault(); try { gerar(); } catch(err){ console.error(err); alert('Erro ao gerar prova.'); }});
  btnLimpar?.addEventListener('click', () => {
    form.reset();
    resultado = [];
    artigo.innerHTML = '';
    artigoImpressao.innerHTML = '';
    previewConteudo.classList.add('hidden');
    previewVazio.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  btnImprimir?.addEventListener('click', () => window.print());

  document.addEventListener('click', onClickAlternativa);
  document.addEventListener('keydown', onKeyAlternativa);

  // Boot
  carregarBanco().catch(e => {
    console.error(e);
    alert('Falha ao carregar banco de questões. Sirva os arquivos via HTTP.');
  });
})();
