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
docker build -t specification-lab-quickcheck:prod-test -f Dockerfile.quickcheck.prod-test .
docker build -t specification-lab-fitspec:prod-test -f Dockerfile.fitspec.prod-test .
```

**Note:** These commands assume the Dockerfiles are named `Dockerfile.quickcheck.prod-test` and `Dockerfile.fitspec.prodtest` and are located in the project root. Adjust the paths if your repository uses a different structure.

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

Choose **01 · Insert** or **02 · Sort** in the left sidebar. Each exercise has its own three stages (description, QuickCheck, FitSpec), independently saved in the browser. The backend selects a separate hidden `Reference` module for each exercise. For Sort, import `Reference (sort)`; do not implement `sort` in student submissions.

The Sort coverage checker assesses sorted output, length preservation, and permutation/multiplicity preservation. It uses conservative recognition and fault probes; feedback is not a formal proof.
