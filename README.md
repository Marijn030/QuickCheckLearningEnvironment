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

## GitHub Pages

The frontend can also be accessed through GitHub Pages. However, QuickCheck and FitSpec execution requires a separately running backend.

For full functionality during local development, use **http://localhost:5500** with the Node.js backend and Docker Desktop running.
## Exercises

Choose **Insert** or **Sort** in the left sidebar. Each exercise has its own three stages (description, QuickCheck, FitSpec), independently saved in the browser. The backend selects a separate hidden `Reference` module for each exercise. For Sort, import `Reference (sort)`; do not implement `sort` in student submissions.

The Sort coverage checker assesses sorted output, length preservation, and permutation/multiplicity preservation. It uses conservative recognition and fault probes; feedback is not a formal proof.

## Adding an exercise

1. Add an entry to `frontend/exercises.json` with a unique `id`, `label`, `title`, `prompt`, `type`, and `templates` containing `quickcheck` and `fitspec` Haskell starter strings.
2. Create `backend/exercises/<id>/Reference.hs` exporting the exercise function from module `Reference`.
3. Create `backend/exercises/<id>/coverage.js` (copy an existing definition). Export `requirements` (each with `id`, `title`, and `hint` array), `mutants` (Haskell module source keyed by requirement ID), `evidenceFor(body)` (returns requirement IDs mapped to booleans), `generatorMessage`, and `note`. Optionally set `skipUnrecognized`.
4. Restart the backend and refresh the frontend. The registry and dropdown load the catalog automatically; no changes to `server.js`, `app.js`, or the shared `coverage-engine.js` are needed.
5. Validate the correct reference, faulty versions, and positive/negative property examples before using the exercise with students.

The catalog is public; keep reference implementations and coverage definitions in the backend. The shared engine still uses conservative source patterns and targeted fault probes. Existing browser storage keys are unchanged.

Run the lightweight regression tests with `node --test backend/tests/coverage.test.js` from the project root. These simulate execution results and do not replace Docker integration testing. `backend/server-backup.js` and its root-level reference files are legacy files; the active server uses the exercise directories above.
