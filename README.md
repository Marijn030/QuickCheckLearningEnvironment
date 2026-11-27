# QuickCheckLearningEnvironment

QuickCheck Learning Environment

## Running the application locally

The application consists of a frontend, a Node.js backend, and Docker containers for executing QuickCheck and FitSpec.

### Prerequisites

Make sure the following software is installed:

- Docker Desktop
- Node.js
- Python 3

### 1. Start Docker Desktop

Open Docker Desktop and wait until the Docker engine is running.

You can verify this in PowerShell:

```powershell
docker info
```

### 2. Build the Docker images (first-time setup)

The application uses two Docker images to execute Haskell code:

- `specification-lab-quickcheck:prod-test` — runs QuickCheck properties and checks requirement coverage.
- `specification-lab-fitspec:prod-test` — runs FitSpec to investigate specification completeness and minimality.

When running the project for the first time, these images must be built locally from the Dockerfiles included in the repository.

Open PowerShell in the project root and run:

```powershell
docker build -t specification-lab-quickcheck:prod-test -f deploy/Dockerfile.quickcheck.prod-test .
docker build -t specification-lab-fitspec:prod-test -f deploy/Dockerfile.fitspec.prod-test .
```


Verify that the images were created:

```powershell
docker images
```

You should see both images in the output.

**Important:** The image names and tags must match those configured in `backend/server.js` and the coverage checker. If the backend uses `:local` rather than `:prod-test`, either update the backend configuration or build the images with the corresponding tags.

You only need to rebuild the images when setting up the project for the first time or after changing the Dockerfiles or their dependencies.

### 3. Start the backend (Node.js)

Once the Docker images have been built, start the backend:

```powershell
node .\backend\server.js
```

The backend runs at:

http://localhost:3001

Keep this terminal running.

Continue with the frontend setup described in the next section.

### 4. Start the frontend (Python)

Open a **second terminal** and run:

```powershell
cd "..\QuickCheckLearningEnvironment\frontend"
python -m http.server 5500
```

Alternatively, if `python` is not recognized:

```powershell
py -m http.server 5500
```

Keep this terminal running.

### 5. Open the application

Open your browser and navigate to:

**http://localhost:5500**

You can now use the learning environment to run QuickCheck and FitSpec exercises.

### 6. Stop the application

Press `Ctrl+C` in both terminals to stop the backend and frontend servers.

You can then close Docker Desktop.

## Troubleshooting

**Cannot reach the backend at http://localhost:3001**

Make sure the Node.js backend is running in the first terminal and Docker Desktop is started.

**Docker image not found**

Check the available Docker images:

```powershell
docker images
```

The backend should reference existing QuickCheck and FitSpec images, such as:

- `specification-lab-quickcheck:prod-test`
- `specification-lab-fitspec:prod-test`

**Port already in use**

Check whether another frontend or backend server is already running. Stop the previous process before starting a new one.

## Student workflow

Start both servers before opening the page. The exercise catalog is now served by the backend, not a static frontend JSON file. Select Insert or Sort. Write a description at the top, QuickCheck properties on the left, and FitSpec properties on the right. On narrow screens the panels stack. Existing browser storage keys for student code are retained.

Run QuickCheck to see test output, then check coverage. The checker runs named properties against the correct reference once and compares passing property fingerprints with the teacher's model. It normalizes whitespace, argument names and some helper names/import aliases. It does not prove equivalence, infer implications or use mutants. FitSpec remains the mutation analysis stage.

Hints: one initial hint, plus one for each distinct passing non-placeholder property whose fingerprint refers to the exercise function. Each reveal consumes one shared credit, and each model property has three ordered hints. Reveals persist locally per exercise. This is formative scaffolding, not secure assessment: hints are returned in the coverage response and the browser enforces the reveal budget. Students with developer tools can inspect them. Simple structural matching can miss valid alternatives or accept misleading code; hint eligibility is heuristic too.

## Adding an exercise (teacher)

Create a folder `backend/exercises/<id>/` with three files. Copy an existing exercise as a starting point.

- `exercise.json`: short `description`, concrete `signature` (e.g. `reverse :: [Int] -> [Int]`), and `hints` mapping each model property name to exactly three strings. Optional `label` controls the dropdown.
- `Reference.hs`: a Haskell module named `Reference` exporting the function from the signature.
- `Model.hs`: ordinary QuickCheck properties and helpers, with each expected property registered using a separate `quickCheck propertyName` line in `main`.

Restart the backend and refresh the browser. Starter templates and the public catalog are generated automatically. No exercise-specific JavaScript or mutant definitions are required. The model and reference are not served by the catalog endpoint. The prototype is intended for local trusted use; distributing the whole repository also distributes teacher solutions.

Use concrete first-order function signatures supported by QuickCheck and FitSpec. The matcher supports simple top-level equations, not arbitrary Haskell syntax. Model properties are not automatically compiled on registration; teachers should validate them against the reference using QuickCheck and try student variants before class. Redundant teacher properties may remain unmatched even when a stronger student property implies them. FitSpec can help explore this distinction.

Run `node --test backend/tests/coverage.test.js` for simulated regression tests. Docker integration must be tested separately. GitHub Pages alone cannot execute the app; the frontend requires a running API.

The included QLE_Prototype_Overview.pdf describes an earlier prototype, not this revised workflow.
