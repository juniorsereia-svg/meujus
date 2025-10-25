// Site funcional: carrega /data/manifest.json e TXT, faz parse e gera prova.
(function () {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const ano = $('#ano');
  const anoRodape = $('#anoRodape');
  [ano, anoRodape].forEach(el => el && (el.textContent = new Date().getFullYear()));

  const selCurso = $('#selCurso');
  const inpDisciplina = $('#inpDisciplina');
  const inpTemas = $('#inpTemas');
  const inpQtd = $('#inpQtd');
  const selOrdem = $('#selOrdem');
  const ckNorm = $('#ckNorm');
  const ckCitar = $('#ckCitar');
  const ckAlt = $('#ckAlt');

  const form = $('#formProva');
  const previewVazio = $('#previewVazio');
  const previewConteudo = $('#previewConteudo');
  const artigo = $('#artigo');
  const btnLimpar = $('#btnLimpar');
  const btnImprimir = $('#btnImprimir');
  const btnBaixarJSON = $('#btnBaixarJSON');
  const listaChecks = $('#listaChecks');

  // Estado
  let banco = []; // [{meta, enunciado, alternativas, gabarito, tema, disciplina}]
  let ultimoResultado = [];

  function setCheck(index, ok) {
    const item = listaChecks?.children?.[index];
    if (!item) return;
    const dot = item.querySelector('span');
    if (dot) dot.className = `h-2.5 w-2.5 rounded-full ${ok ? 'bg-emerald-500' : 'bg-zinc-300'}`;
  }

  function normalizarPontuacao(txt) {
    if (!ckNorm.checked) return txt;
    return txt
      .replace(/\s+([,.;:!?])/g, '$1')
      .replace(/([(\[])\s+/g, '$1')
      .replace(/\s{2,}/g, ' ')
      .replace(/\s*-\s*/g, ' - ')
      .trim();
  }

  function padronizarAlternativas(alts) {
    if (!ckAlt.checked) return alts;
    const letras = ['A', 'B', 'C', 'D', 'E'];
    return alts.map((t, i) => {
      // remove prefixos como "A) " ou "a) "
      const sem = t.replace(/^[A-Ea-e]\)\s*/,'').trim();
      return `${letras[i]}) ${sem}`;
    });
  }

  function detectarCitacoes(texto) {
    if (!ckCitar.checked) return [];
    const rx = /\b(art\.?\s*\d+[A-Za-zº\-]*\s*(?:[,§º\w\s]*?)?(?:CF\/88|CP|CPP|CDC|Lei\s*n?[ºo]?\s*\d[\d\.\/-]*\/?\d{0,4}))\b/gi;
    const achados = new Set();
    let m;
    while ((m = rx.exec(texto)) !== null) {
      achados.add(m[0].replace(/\s+/g, ' ').trim());
    }
    return Array.from(achados);
  }

  function validar(resultado) {
    // 0 numeração
    setCheck(0, resultado.length > 0);
    // 1 alternativas padronizadas A-E
    const pad = resultado.every(q => q.alternativas.length === 5 && q.alternativas.every((a,i)=>a.startsWith('ABCDE'[i]+') ')));
    setCheck(1, pad);
    // 2 gabarito único
    const gab = resultado.every(q => /^[A-E]$/.test(q.gabarito));
    setCheck(2, gab);
    // 3 citações detectadas (pelo menos se existirem no texto)
    const temCit = resultado.some(q => q.citacoes && q.citacoes.length);
    setCheck(3, temCit || true);
  }

  async function carregarBanco() {
    const res = await fetch('./data/manifest.json');
    const manifest = await res.json();
    const cursos = Object.keys(manifest);
    selCurso.innerHTML = cursos.map(c => `<option>${c}</option>`).join('');
    // Carregar todos os arquivos listados
    for (const curso of cursos) {
      const folder = manifest[curso].folder;
      const files = manifest[curso].files;
      for (const f of files) {
        const txt = await fetch(`./data/${folder}/${f}`).then(r => r.text());
        const registros = parseArquivo(txt, curso);
        banco.push(...registros);
      }
    }
  }

  function parseArquivo(txt, curso) {
    // separa por linhas com 5 hifens
    const blocos = txt.split(/\n-{5,}\s*\n/).map(s => s.trim()).filter(Boolean);
    const out = [];
    for (const b of blocos) {
      const linhas = b.split('\n').map(s => s.trim()).filter(Boolean);
      if (!linhas.length) continue;
      // grupos por prefixo * ** *** **** ***** ******
      let metaLinha = linhas.find(l => l.startsWith('* '));
      let enunciadoLinhas = linhas.filter(l => l.startsWith('** ')).map(l => l.replace(/^\*\*\s*/, ''));
      let alternativas = linhas.filter(l => l.startsWith('*** ')).map(l => l.replace(/^\*\*\*\s*/, ''));
      let gabaritoLinha = linhas.find(l => l.startsWith('**** '));
      let temaLinha = linhas.find(l => l.startsWith('***** '));
      let discLinha = linhas.find(l => l.startsWith('****** '));

      if (!metaLinha || !enunciadoLinhas.length || alternativas.length < 2 || !gabaritoLinha) continue;

      const meta = metaLinha.replace(/^\*\s*/, '');
      const enunciado = normalizarPontuacao(enunciadoLinhas.join(' '));
      const alts = padronizarAlternativas(alternativas.map(a => normalizarPontuacao(a)));
      const gab = (gabaritoLinha.replace(/^(\*{4}\s*)?Gabarito:\s*/i,'').trim().match(/^[A-E]/i)||[''])[0].toUpperCase();
      const tema = temaLinha ? temaLinha.replace(/^\*{5}\s*/, '').trim() : '';
      const disciplina = (discLinha ? discLinha.replace(/^\*{6}\s*/, '').trim() : (inpDisciplina.value||curso)).trim() || curso;

      const citacoes = detectarCitacoes(enunciado + ' ' + alts.join(' '));
      out.push({ meta, enunciado, alternativas: alts, gabarito: gab, tema, disciplina, curso });
    }
    return out;
  }

  function filtrarBanco() {
    const cursoAlvo = selCurso.value.trim();
    const disc = inpDisciplina.value.trim().toLowerCase();
    const temas = inpTemas.value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    let pool = banco.filter(q => q.curso === cursoAlvo);
    if (disc) pool = pool.filter(q => q.disciplina.toLowerCase().includes(disc));
    if (temas.length) pool = pool.filter(q => temas.some(t => (q.tema||'').toLowerCase().includes(t)));
    return pool;
  }

  function embaralhar(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function gerarProva() {
    const pool = filtrarBanco();
    let lista = pool.slice();
    if (selOrdem.value === 'aleatoria') embaralhar(lista);
    const qtd = Math.max(1, Math.min(parseInt(inpQtd.value || '1', 10), 100));
    lista = lista.slice(0, qtd);

    ultimoResultado = lista.map((q, idx) => ({
      numero: idx + 1,
      ...q
    }));

    renderPreview(ultimoResultado);
    validar(ultimoResultado);
  }

  function renderPreview(questoes) {
    if (!questoes.length) {
      previewConteudo.classList.add('hidden');
      previewVazio.classList.remove('hidden');
      artigo.innerHTML = '';
      return;
    }
    previewVazio.classList.add('hidden');
    previewConteudo.classList.remove('hidden');

    const header = `
      <header class="mb-6">
        <h1 class="text-2xl font-bold">Prova — ${selCurso.value}</h1>
        <p class="text-sm text-zinc-600">Questões: ${questoes.length}</p>
      </header>`;

    const itens = questoes.map(q => {
      const alts = q.alternativas.map(a => `<li>${a}</li>`).join('');
      return `<li class="rounded-2xl border border-zinc-200 p-4">
        <h4 class="font-semibold">${q.numero}) ${q.enunciado}</h4>
        <ul class="mt-3 space-y-1">${alts}</ul>
        <div class="mt-3 text-xs text-zinc-500">Tema: ${q.tema || '—'} • Disciplina: ${q.disciplina} • Gabarito: ${q.gabarito}</div>
      </li>`;
    }).join('');

    artigo.innerHTML = header + `<ol class="space-y-6">${itens}</ol>`;
    window.scrollTo({ top: previewConteudo.offsetTop - 80, behavior: 'smooth' });
  }

  function baixarJSON() {
    const blob = new Blob([JSON.stringify(ultimoResultado, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'prova.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  // Eventos
  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    try { gerarProva(); } catch (err) { console.error(err); alert('Erro ao gerar prova. Veja o console.'); }
  });

  btnLimpar?.addEventListener('click', () => {
    form.reset();
    artigo.innerHTML = '';
    previewConteudo.classList.add('hidden');
    previewVazio.classList.remove('hidden');
    [0,1,2,3].forEach(i => setCheck(i, false));
  });

  btnImprimir?.addEventListener('click', () => window.print());
  btnBaixarJSON?.addEventListener('click', baixarJSON);

  // Boot
  carregarBanco().catch(e => {
    console.error(e);
    alert('Falha ao carregar banco de questões. Certifique-se de servir os arquivos via HTTP.');
  });
})();