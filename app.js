/* app.js - Protótipo de parser e gerador de provas.
   Observações:
   - Espera-se um arquivo data/manifest.json com estrutura:
     { "Direito Penal": ["direitopenal.txt"] }
   - Cada arquivo .txt deve seguir o padrão com * ** *** **** ***** ****** e ----- como separador.
*/

const manifestPath = 'data/manifest.json';

let allQuestions = [];
let currentExam = [];
let startTime = null;
let timerInterval = null;

document.addEventListener('DOMContentLoaded', () => {
  initUI();
});

async function initUI(){
  const selectDisc = document.getElementById('select-disciplina');
  const temasList = document.getElementById('temas-list');
  const btnGerar = document.getElementById('btn-gerar');
  const btnLimpar = document.getElementById('btn-limpar');
  const btnImprimir = document.getElementById('btn-imprimir');

  const manifest = await fetchManifest();
  populateDisciplines(manifest);

  selectDisc.addEventListener('change', async () => {
    const disc = selectDisc.value;
    if(!disc) return;
    allQuestions = [];
    const files = manifest[disc] || [];
    // carregar todos os txts da disciplina
    for(const f of files){
      const url = `data/${encodeURIComponent(disc)}/${f}`;
      try{
        const txt = await fetch(url).then(r => r.text());
        const parsed = parseQuestions(txt);
        // marque disciplina caso falte
        parsed.forEach(q => { if(!q.disciplina) q.disciplina = disc; });
        allQuestions.push(...parsed);
      }catch(err){
        console.error('Erro ao carregar', url, err);
      }
    }
    populateThemes();
  });

  btnGerar.addEventListener('click', () => {
    gerarProva();
  });

  btnLimpar.addEventListener('click', () => {
    clearProva();
  });

  btnImprimir.addEventListener('click', () => {
    window.print();
  });
}

async function fetchManifest(){
  try{
    const res = await fetch(manifestPath);
    return await res.json();
  }catch(e){
    console.warn('manifest não encontrado em', manifestPath, 'use exemplo local');
    return { "Direito Penal": ["direitopenal.txt"] };
  }
}

function populateDisciplines(manifest){
  const selectDisc = document.getElementById('select-disciplina');
  selectDisc.innerHTML = '<option value="">-- selecione --</option>';
  Object.keys(manifest).forEach(d => {
    const opt = document.createElement('option');
    opt.value = d;
    opt.textContent = d;
    selectDisc.appendChild(opt);
  });
}

function populateThemes(){
  const temasList = document.getElementById('temas-list');
  temasList.innerHTML = '';
  const temas = new Set();
  allQuestions.forEach(q => {
    if(q.tema) temas.add(q.tema);
  });
  Array.from(temas).sort().forEach(t => {
    const id = 'tema-' + slugify(t);
    const div = document.createElement('label');
    div.className = 'tema-checkbox';
    div.innerHTML = `<input type="checkbox" value="${escapeHtml(t)}" id="${id}" /> ${escapeHtml(t)}`;
    temasList.appendChild(div);
  });
}

function parseQuestions(txt){
  const parts = txt.split(/-{5,}\s*/); // split on ----- (5 traços) and possible trailing whitespace
  const qs = [];
  for(let block of parts){
    block = block.trim();
    if(!block) continue;
    const lines = block.split(/\r?\n/).map(l => l.trim()).filter(l => l.length>0);
    const q = { meta:'', enunciado:'', alternativas:[], gabarito:'', tema:'', disciplina:'' };
    for(const line of lines){
      if(line.startsWith('******')) q.disciplina = line.replace(/^\*+/, '').trim();
      else if(line.startsWith('*****')) q.tema = line.replace(/^\*+/, '').trim();
      else if(line.startsWith('****')) q.gabarito = line.replace(/^\*+/, '').replace(/Gabarito:\s*/i,'').trim();
      else if(line.startsWith('***')) {
        // alternativa
        const alt = line.replace(/^\*+/,'').trim();
        q.alternativas.push(alt);
      } else if(line.startsWith('**')) {
        const text = line.replace(/^\*+/,'').trim();
        q.enunciado = q.enunciado ? (q.enunciado + ' ' + text) : text;
      } else if(line.startsWith('*')) {
        q.meta = line.replace(/^\*+/,'').trim();
      } else {
        // se houver linhas livres, concatene ao enunciado
        q.enunciado = q.enunciado ? (q.enunciado + ' ' + line) : line;
      }
    }
    if(q.enunciado) qs.push(q);
  }
  return qs;
}

function gerarProva(){
  // obter temas selecionados
  const temasChecked = Array.from(document.querySelectorAll('#temas-list input[type=checkbox]:checked')).map(i => i.value);
  const qtd = parseInt(document.getElementById('qtd').value || '10', 10);
  // filtrar por tema
  let pool = allQuestions.filter(q => temasChecked.length === 0 || temasChecked.includes(q.tema));
  if(pool.length === 0){
    alert('Nenhuma questão encontrada para os temas selecionados.');
    return;
  }
  // embaralhar questões (mantendo alternativas na ordem original)
  shuffleArray(pool);
  currentExam = pool.slice(0, Math.min(qtd, pool.length));
  renderExam();
  startTimer();
}

function renderExam(){
  const lista = document.getElementById('questoes-list');
  lista.innerHTML = '';
  currentExam.forEach((q, idx) => {
    const art = document.createElement('article');
    art.className = 'questao';
    art.id = `q-${idx}`;
    const h3 = document.createElement('h3');
    h3.textContent = `Questão ${idx+1}`;
    const env = document.createElement('p');
    env.className = 'enunciado';
    env.innerHTML = escapeHtml(q.enunciado);
    const ul = document.createElement('ul');
    ul.className = 'alternativas';
    // construir opções (usar radio)
    q.alternativas.forEach((a, i) => {
      const li = document.createElement('li');
      const optId = `q${idx}-opt${i}`;
      li.innerHTML = `<label><input type="radio" name="q${idx}" value="${String.fromCharCode(65+i)}" id="${optId}"> ${escapeHtml(a)}</label>`;
      ul.appendChild(li);
    });

    // botão principal que expande ações
    const toggle = document.createElement('button');
    toggle.className = 'actions-toggle';
    toggle.type = 'button';
    toggle.textContent = 'Ações ▴';
    toggle.setAttribute('aria-expanded', 'false');

    const actions = document.createElement('div');
    actions.className = 'actions hidden';

    // criar 7 sub-botoes com prompts padrão
    const prompts = getPromptsForQuestion(q);
    prompts.forEach((p, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'subbtn';
      b.textContent = p.label;
      b.addEventListener('click', () => {
        // abrir pesquisa do Google como fallback (não há URL pública para Bard)
        const payload = `${p.prompt}\n\nENUNCIADO:\n${q.enunciado}\n\nALTERNATIVAS:\n${q.alternativas.join('\n')}`;
        const url = 'https://www.google.com/search?q=' + encodeURIComponent(payload) + '&udm=50';
        window.open(url, '_blank');
      });
      // botão de copiar prompt
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'subbtn copy';
      copy.textContent = 'Copiar prompt';
      copy.addEventListener('click', () => {
        const payload = `${p.prompt}\n\nENUNCIADO:\n${q.enunciado}\n\nALTERNATIVAS:\n${q.alternativas.join('\n')}`;
        navigator.clipboard.writeText(payload).then(() => {
          copy.textContent = 'Copiado ✓';
          setTimeout(()=> copy.textContent = 'Copiar prompt', 1200);
        });
      });

      const wrapper = document.createElement('div');
      wrapper.style.display='inline-flex';
      wrapper.style.gap='.25rem';
      wrapper.appendChild(b);
      wrapper.appendChild(copy);
      actions.appendChild(wrapper);
    });

    toggle.addEventListener('click', () => {
      const shown = !actions.classList.contains('hidden');
      if(shown){
        actions.classList.add('hidden');
        toggle.setAttribute('aria-expanded','false');
      }else{
        actions.classList.remove('hidden');
        toggle.setAttribute('aria-expanded','true');
      }
    });

    art.appendChild(h3);
    art.appendChild(env);
    art.appendChild(ul);
    art.appendChild(toggle);
    art.appendChild(actions);
    lista.appendChild(art);
  });

  document.getElementById('info-area').classList.remove('hidden');
  document.getElementById('resultado').classList.add('hidden');
  document.getElementById('btn-corrigir').addEventListener('click', corrigirProva);
}

function clearProva(){
  currentExam = [];
  document.getElementById('questoes-list').innerHTML = '';
  document.getElementById('info-area').classList.add('hidden');
  stopTimer();
  document.getElementById('resultado').classList.add('hidden');
}

function corrigirProva(){
  stopTimer();
  let correct = 0;
  const details = [];
  currentExam.forEach((q, idx) => {
    const selected = document.querySelector(`input[name=q${idx}]:checked`);
    const user = selected ? selected.value.trim() : null;
    const answer = (q.gabarito || '').trim();
    const ok = user && user.toUpperCase() === answer.toUpperCase();
    if(ok) correct++;
    details.push({ idx: idx+1, user, answer, ok });
  });
  const total = currentExam.length;
  const percent = Math.round((correct/total)*100);
  const elapsed = getElapsed();
  const res = document.getElementById('resultado');
  res.classList.remove('hidden');
  res.innerHTML = `<strong>Resultados:</strong> ${correct} / ${total} acertos — ${percent}%<br>Tempo gasto: ${formatTime(elapsed)}<br><details><summary>Detalhes</summary><pre>${details.map(d=>`Q${d.idx}: você=${d.user||'-'} | gabarito=${d.answer} | ${d.ok?'ACERTOU':'ERROU'}`).join('\n')}</pre></details>`;
  // marcar visualmente
  details.forEach(d => {
    const art = document.getElementById(`q-${d.idx-1}`);
    if(art){
      art.style.background = d.ok ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.03)';
    }
  });
}

function startTimer(){
  startTime = Date.now();
  const tEl = document.getElementById('timer');
  if(timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    const elapsed = getElapsed();
    tEl.textContent = `Tempo: ${formatTime(elapsed)}`;
  }, 1000);
}

function stopTimer(){
  if(timerInterval) clearInterval(timerInterval);
  timerInterval = null;
}

function getElapsed(){
  if(!startTime) return 0;
  return Math.floor((Date.now() - startTime)/1000);
}

function formatTime(seconds){
  const mm = String(Math.floor(seconds/60)).padStart(2,'0');
  const ss = String(seconds % 60).padStart(2,'0');
  return `${mm}:${ss}`;
}

/* Utilitários */
function shuffleArray(a){
  for(let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}

function slugify(s){ return s.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9\-]/g,''); }
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, function(m){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]; }); }

/* Geração de 7 prompts padrão por questão */
function getPromptsForQuestion(q){
  const base = [
    { label: 'Justificativa (detalhada)', prompt: 'Explique detalhadamente a solução da questão, passo a passo, com base legal quando aplicável.' },
    { label: 'Resumo objetivo', prompt: 'Resuma a resposta da questão em poucas linhas, com destaque para o elemento-chave.' },
    { label: 'Fonte/Referência', prompt: 'Indique a fonte legal ou bibliográfica que fundamenta a resposta, com artigo/parte da lei.' },
    { label: 'Questão similar', prompt: 'Sugira uma questão similar (mesmo tema) de dificuldade média.' },
    { label: 'Dica de estudo', prompt: 'Forneça uma dica de estudo focada para memorizar o conceito usado na questão.' },
    { label: 'Erro comum', prompt: 'Explique os erros comuns que os alunos cometem ao resolver essa questão.' },
    { label: 'Explicação simplificada', prompt: 'Explique a resposta em linguagem simples para facilitar o entendimento.' }
  ];
  return base;
}
