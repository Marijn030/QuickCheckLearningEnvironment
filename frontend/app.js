(async () => {
  const exerciseSelect = document.getElementById('exercise-select');
  let catalog;
  try {
    const response = await fetch('http://localhost:3001/api/exercises');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    catalog = await response.json();
    if (!Array.isArray(catalog) || !catalog.length) throw new Error('Empty exercise catalog');
  } catch (error) {
    document.getElementById('exercise-prompt').textContent = 'Could not load exercises: ' + error.message;
    document.querySelectorAll('button, textarea, select').forEach(el => el.disabled = true);
    return;
  }
  const exercises = Object.fromEntries(catalog.map(item => [item.id, item]));
  exerciseSelect.replaceChildren(...catalog.map(item => new Option(item.label, item.id)));
  const storedExercise = localStorage.getItem('specification-lab:exercise');
  let exercise = Object.hasOwn(exercises, storedExercise) ? storedExercise : catalog[0].id;
  let storagePrefix = `specification-lab:${exercise}:v1:`;

  const store = (key, value) => { try { localStorage.setItem(storagePrefix + key, value); } catch (_) {} };
  const load = key => { try { return localStorage.getItem(storagePrefix + key) || ''; } catch (_) { return ''; } };
  const description = document.getElementById('description');
  description.value = load('description');
  description.addEventListener('input', () => { store('description', description.value); saved(); });
  const editors = {};
  function saved() { document.getElementById('save-status').textContent = 'Saved locally'; }
  function updateExerciseDisplay() {
    exerciseSelect.value = exercise;
    document.getElementById('exercise-title').textContent = exercises[exercise].title;
    document.getElementById('exercise-prompt').textContent = '';
    document.getElementById('exercise-prompt').hidden = true;
    document.getElementById('exercise-type').textContent = exercises[exercise].type;
  }
  updateExerciseDisplay();
  exerciseSelect.addEventListener('change', () => {
    exercise = exerciseSelect.value;
    localStorage.setItem('specification-lab:exercise', exercise);
    storagePrefix = `specification-lab:${exercise}:v1:`;
    updateExerciseDisplay();
    description.value = load('description');
    const templates = exercises[exercise].templates;
    for (const name of ['quickcheck','fitspec']) {
      const value = load(name) || templates[name];
      if (editors[name]?.setValue) editors[name].setValue(value);
      else {
        const textarea = document.querySelector('#' + name + '-editor textarea');
        if (textarea) textarea.value = value;
      }
      document.getElementById(name + '-results').textContent = 'No run yet.';
    }
    document.getElementById('coverage-feedback').innerHTML = '<h3>Properties feedback</h3><p>Run QuickCheck, then check coverage for feedback and hints.</p>';
    saved();
  });
  function setupEditor(name) {
    const value = load(name) || exercises[exercise].templates[name];
    if (window.monaco) {
      editors[name] = monaco.editor.create(document.getElementById(name + '-editor'), {
        value, language: 'haskell', theme: 'vs', fontSize: 14, lineHeight: 23,
        minimap: { enabled: false }, automaticLayout: true, scrollBeyondLastLine: false,
        wordWrap: 'on', tabSize: 2
      });
      editors[name].onDidChangeModelContent(() => { store(name, editors[name].getValue()); saved(); });
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = value;
      textarea.setAttribute('aria-label', name + ' Haskell editor');
      textarea.style.cssText = 'width:100%;height:100%;padding:16px;border:0;resize:none;font:14px/23px Consolas,monospace';
      document.getElementById(name + '-editor').appendChild(textarea);
      textarea.addEventListener('input', () => { store(name, textarea.value); saved(); });
    }
  }
  function editorText(name) {
    const editor = editors[name];
    if (editor && typeof editor.getValue === 'function') return editor.getValue();
    const fallback = document.querySelector('#' + name + '-editor textarea');
    return fallback ? fallback.value : (load(name) || exercises[exercise].templates[name]);
  }
  document.getElementById('run-quickcheck').addEventListener('click', async () => {
    const button = document.getElementById('run-quickcheck');
    const results = document.getElementById('quickcheck-results');
    button.disabled = true;
    exerciseSelect.disabled = true;
    results.textContent = 'Compiling and running QuickCheck...';
    try {
      const response = await fetch('http://localhost:3001/api/quickcheck', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: editorText('quickcheck'), exercise })
      });
      const data = await response.json();
      results.textContent = data.output || data.error || 'No output returned.';
    } catch (error) {
      results.textContent = 'Cannot reach the backend at http://localhost:3001. Start it with node backend/server.js.\n' + error.message;
    } finally {
      button.disabled = false;
      unlockExercise();
    }
  });
  // QuickCheck coverage accepts ordinary properties and `main = do quickCheck name`.
  function unlockExercise() {
    exerciseSelect.disabled = ['run-quickcheck', 'check-coverage', 'run-fitspec'].some(id => document.getElementById(id).disabled);
  }
  const coverageButton = document.getElementById('check-coverage');
  const coveragePanel = document.getElementById('coverage-feedback');
  coverageButton.addEventListener('click', async () => {
    coverageButton.disabled = true;
    exerciseSelect.disabled = true;
    coveragePanel.replaceChildren();
    const status = document.createElement('p');
    status.textContent = 'Checking properties against the reference and comparing with teacher model properties...';
    coveragePanel.appendChild(status);
    try {
      const response = await fetch('http://localhost:3001/api/coverage', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: editorText('quickcheck'), exercise })
      });
      const data = await response.json();
      coveragePanel.replaceChildren();
      const title = document.createElement('h3');
      title.textContent = data.ok ? 'Properties feedback' : 'Coverage check could not finish';
      coveragePanel.appendChild(title);
      if (!data.ok) {
        const p = document.createElement('p');
        p.textContent = data.error || 'Unexpected checker error.';
        coveragePanel.appendChild(p);
        if (data.output) {
          const pre = document.createElement('pre'); pre.textContent = data.output;
          coveragePanel.appendChild(pre);
        }
        return;
      }
      const intro = document.createElement('p');
      intro.textContent = `${data.properties.length} QuickCheck propert${data.properties.length === 1 ? 'y' : 'ies'} passed on the correct implementation.`;
      coveragePanel.appendChild(intro);
      let revealed;
      try { revealed = JSON.parse(load('revealed-hints-v2') || '{}'); } catch { revealed = {}; }
      const used = () => Object.values(revealed).reduce((a,b)=>a+b,0);
      const budget = data.hintBudget;
      const counter = document.createElement('p');
      const hintButtons = [];
      function refreshHints() {
        counter.textContent = `${Math.max(0,budget-used())} additional hint(s) available. Start with one hint; each distinct passing property referring to the exercise function unlocks one more.`;
        for (const update of hintButtons) update();
      }
      coveragePanel.appendChild(counter);
      if(data.failed?.length) { const p=document.createElement('p'); p.textContent='Not passing: '+data.failed.join(', '); coveragePanel.appendChild(p); }
      for (const item of data.checks) {
        const card = document.createElement('div'); card.className = 'feedback-item';
        const heading = document.createElement('strong');
        heading.textContent = `${item.status === 'detected' ? '✓' : '○'} ${item.title}: ${item.status === 'detected' ? 'property demonstrated' : item.status === 'inconclusive' ? 'inconclusive' : 'not yet demonstrated'}`;
        card.appendChild(heading);
        if (item.message) { const explanation = document.createElement('p'); explanation.textContent = item.message; card.appendChild(explanation); }
        if (item.status !== 'detected') {
          const hints = document.createElement('div');
          const button = document.createElement('button'); button.className='secondary';
          function update() {
            hints.replaceChildren();
            const count=Math.min(3,revealed[item.id]||0);
            item.hint.slice(0,count).forEach((hint,i)=>{ const p=document.createElement('p'); p.textContent=`Hint ${i+1}: ${hint}`; hints.appendChild(p); });
            button.textContent=count===3?'All hints revealed':`Reveal hint ${count+1}`;
            button.disabled=count===3||used()>=budget;
          }
          button.addEventListener('click',()=>{if(used()>=budget||(revealed[item.id]||0)>=3)return; revealed[item.id]=(revealed[item.id]||0)+1; store('revealed-hints-v2',JSON.stringify(revealed)); refreshHints();});
          hintButtons.push(update); card.append(hints,button);
          if (item.detail) { const pre = document.createElement('pre'); pre.textContent = item.detail; card.appendChild(pre); }
        }
        coveragePanel.appendChild(card);
      }
      refreshHints();
      const bonus = document.createElement('p'); bonus.textContent = `Generator bonus: ${data.generator.message}`;
      coveragePanel.appendChild(bonus);
      const note = document.createElement('p'); note.className = 'feedback-note'; note.textContent = data.note;
      coveragePanel.appendChild(note);
    } catch (error) {
      coveragePanel.replaceChildren();
      const p = document.createElement('p');
      p.textContent = `Coverage request failed: ${error.message}. Make sure the updated backend is running at localhost:3001.`;
      coveragePanel.appendChild(p);
    } finally { coverageButton.disabled = false; unlockExercise(); }
  });
  document.getElementById('run-fitspec').addEventListener('click', async () => {
    const button = document.getElementById('run-fitspec');
    const results = document.getElementById('fitspec-results');
    button.disabled = true;
    exerciseSelect.disabled = true;
    results.textContent = 'Compiling and running FitSpec (maximum 5 minutes)...';
    try {
      const response = await fetch('http://localhost:3001/api/fitspec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: editorText('fitspec'), exercise })
      });
      const data = await response.json();
      results.textContent = data.output || data.error || 'No output returned.';
    } catch (error) {
      results.textContent = 'Cannot reach the backend at http://localhost:3001.\n' + error.message;
    } finally {
      button.disabled = false;
      unlockExercise();
    }
  });
  if (window.require && window.require.config) {
    window.require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.52.2/min/vs' } });
    window.require(['vs/editor/editor.main'], () => { setupEditor('quickcheck'); setupEditor('fitspec'); }, () => { setupEditor('quickcheck'); setupEditor('fitspec'); });
  } else {
    setupEditor('quickcheck'); setupEditor('fitspec');
  }
})();
