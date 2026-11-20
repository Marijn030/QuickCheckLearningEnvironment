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
    quickcheck: 
`import Test.QuickCheck
import Reference (insert)

-- Define your helper functions here.


-- Define your properties here
placeholder :: Int -> [Int] -> Bool
placeholder x xs = True

main :: IO ()
main = do
  -- Add your properties here with quickCheck to be able to run and check them
  quickCheck placeholder`
  , fitspec: 
`import Test.FitSpec
import Reference (insert)

-- Define your helper functions here.


-- Define your properties in the list properties, 
-- comma-separated and in the form
-- property $ \\x xs -> ...,

properties :: (Int -> [Int] -> [Int]) -> [Property]
properties f =
  [
    property $ \\(x :: Int) (xs :: [Int]) -> True
  ]

main :: IO ()
main =
  mainWith args
    { names = ["insert x xs"]
    , nMutants = 100
    , nTests = 100
    , timeout = 0
    }
    (insert :: Int -> [Int] -> [Int])
    properties`
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
  // QuickCheck coverage accepts ordinary properties and `main = do quickCheck name`.
  const coverageButton = document.getElementById('check-coverage');
  const coveragePanel = document.getElementById('coverage-feedback');
  coverageButton.addEventListener('click', async () => {
    coverageButton.disabled = true;
    coveragePanel.replaceChildren();
    const status = document.createElement('p');
    status.textContent = 'Checking properties against the correct insert and five faulty versions. This can take a minute...';
    coveragePanel.appendChild(status);
    try {
      const response = await fetch('http://localhost:3001/api/coverage', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: editorText('quickcheck') })
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
      for (const item of data.checks) {
        const card = document.createElement('div'); card.className = 'feedback-item';
        const heading = document.createElement('strong');
        heading.textContent = `${item.status === 'detected' ? '✓' : '○'} ${item.title}: ${item.status === 'detected' ? 'property demonstrated' : item.status === 'inconclusive' ? 'inconclusive' : 'not yet demonstrated'}`;
        card.appendChild(heading);
        if (item.message) { const explanation = document.createElement('p'); explanation.textContent = item.message; card.appendChild(explanation); }
        if (item.status !== 'detected') {
          const details = document.createElement('details');
          const summary = document.createElement('summary'); summary.textContent = 'Show progressive hints';
          details.appendChild(summary);
          item.hint.forEach((hint, i) => {
            const hintDetails = document.createElement('details');
            const hintSummary = document.createElement('summary'); hintSummary.textContent = `Hint ${i + 1}`;
            hintDetails.appendChild(hintSummary);
            const p = document.createElement('p'); p.textContent = hint;
            hintDetails.appendChild(p); details.appendChild(hintDetails);
          });
          card.appendChild(details);
          if (item.detail) { const pre = document.createElement('pre'); pre.textContent = item.detail; card.appendChild(pre); }
        }
        coveragePanel.appendChild(card);
      }
      const bonus = document.createElement('p'); bonus.textContent = `Generator bonus: ${data.generator.message}`;
      coveragePanel.appendChild(bonus);
      const note = document.createElement('p'); note.className = 'feedback-note'; note.textContent = data.note;
      coveragePanel.appendChild(note);
    } catch (error) {
      coveragePanel.replaceChildren();
      const p = document.createElement('p');
      p.textContent = `Coverage request failed: ${error.message}. Make sure the updated backend is running at localhost:3001.`;
      coveragePanel.appendChild(p);
    } finally { coverageButton.disabled = false; }
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
