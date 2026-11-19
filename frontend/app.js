(() => {
  const stages = ['description', 'quickcheck', 'fitspec'];
  const storagePrefix = 'specification-lab:insert:v1:';
  const store = (key, value) => { try { localStorage.setItem(storagePrefix + key, value); } catch (_) {} };
  const load = key => { try { return localStorage.getItem(storagePrefix + key) || ''; } catch (_) { return ''; } };
  const description = document.getElementById('description');
  description.value = load('description');
  description.addEventListener('input', () => { store('description', description.value); saved(); });
  let stage = 'description';
  const editors = {};
  function saved() { document.getElementById('save-status').textContent = 'Saved locally'; }
  function setStage(next) {
    stage = next;
    stages.forEach(s => {
      document.getElementById(s + '-panel').classList.toggle('hidden', s !== stage);
      document.querySelector(`[data-stage="${s}"]`).classList.toggle('active', s === stage);
    });
    document.getElementById('previous').disabled = stage === stages[0];
    document.getElementById('next').disabled = stage === stages[stages.length - 1];
    store('stage', stage);
    if (editors[stage]) editors[stage].layout();
  }
  document.querySelectorAll('[data-stage]').forEach(button => button.addEventListener('click', () => setStage(button.dataset.stage)));
  document.getElementById('previous').addEventListener('click', () => setStage(stages[Math.max(0, stages.indexOf(stage) - 1)]));
  document.getElementById('next').addEventListener('click', () => setStage(stages[Math.min(stages.length - 1, stages.indexOf(stage) + 1)]));
  const initialCode = {
    quickcheck: 'import Test.QuickCheck\nimport Reference (insert)\n\n-- Write your properties and any helper functions here.\n\nmain :: IO ()\nmain = do\n  -- Run your properties with quickCheck.\n  pure ()\n',
    fitspec: 'import Test.FitSpec\nimport Reference (insert)\n\n-- Define your helpers and properties here.\n\nproperties :: (Int -> [Int] -> [Int]) -> [Property]\nproperties f = []\n\nmain :: IO ()\nmain = mainWith args { names = ["insert x xs"], nMutants = 100, nTests = 100, timeout = 0 } (insert :: Int -> [Int] -> [Int]) properties\n'
  };
  function setupEditor(name) {
    const value = load(name) || initialCode[name];
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
  const savedStage = load('stage');
  setStage(stages.includes(savedStage) ? savedStage : 'description');
  function editorText(name) {
    const editor = editors[name];
    if (editor && typeof editor.getValue === 'function') return editor.getValue();
    const fallback = document.querySelector('#' + name + '-editor textarea');
    return fallback ? fallback.value : (load(name) || initialCode[name]);
  }
  document.getElementById('run-quickcheck').addEventListener('click', async () => {
    const button = document.getElementById('run-quickcheck');
    const results = document.getElementById('quickcheck-results');
    button.disabled = true;
    results.textContent = 'Compiling and running QuickCheck...';
    try {
      const response = await fetch('http://localhost:3001/api/quickcheck', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: editorText('quickcheck') })
      });
      const data = await response.json();
      results.textContent = data.output || data.error || 'No output returned.';
    } catch (error) {
      results.textContent = 'Cannot reach the backend at http://localhost:3001. Start it with node backend/server.js.\n' + error.message;
    } finally {
      button.disabled = false;
    }
  });
  document.getElementById('run-fitspec').addEventListener('click', async () => {
    const button = document.getElementById('run-fitspec');
    const results = document.getElementById('fitspec-results');
    button.disabled = true;
    results.textContent = 'Compiling and running FitSpec (up to 90 seconds)...';
    try {
      const response = await fetch('http://localhost:3001/api/fitspec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: editorText('fitspec') })
      });
      const data = await response.json();
      results.textContent = data.output || data.error || 'No output returned.';
    } catch (error) {
      results.textContent = 'Cannot reach the backend at http://localhost:3001.\n' + error.message;
    } finally {
      button.disabled = false;
    }
  });
  if (window.require && window.require.config) {
    window.require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.52.2/min/vs' } });
    window.require(['vs/editor/editor.main'], () => { setupEditor('quickcheck'); setupEditor('fitspec'); });
  } else {
    setupEditor('quickcheck'); setupEditor('fitspec');
  }
})();
