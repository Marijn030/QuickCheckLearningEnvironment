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
    quickcheck: 'import Test.QuickCheck\n\n-- Write your properties and any helper functions here.\n\nmain :: IO ()\nmain = do\n  -- Run your properties with quickCheck.\n  pure ()\n',
    fitspec: 'import Test.FitSpec\n\n-- Write your helpers and FitSpec property list here.\n\n-- Define your FitSpec main function.\n'
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
  ['quickcheck', 'fitspec'].forEach(name => {
    document.getElementById('run-' + name).addEventListener('click', () => {
      document.getElementById(name + '-results').textContent = 'Execution is not connected yet. Your code is saved locally. The next milestone will connect this button to a sandboxed Haskell backend.';
    });
  });
  if (window.require && window.require.config) {
    window.require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.52.2/min/vs' } });
    window.require(['vs/editor/editor.main'], () => { setupEditor('quickcheck'); setupEditor('fitspec'); });
  } else {
    setupEditor('quickcheck'); setupEditor('fitspec');
  }
})();
