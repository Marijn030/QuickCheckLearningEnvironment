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

### 2. Open the project directory

Open PowerShell or the VS Code terminal and navigate to the project root:

```powershell
cd "..\QuickCheckLearningEnvironment"
```

### 3. Start the backend (Node.js)

In your first terminal, run:

```powershell
node .\backend\server.js
```

If the backend file is named `server(1).js`, use:

```powershell
node '.\backend\server(1).js'
```

The backend runs at:

http://localhost:3001

Keep this terminal running.

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

- `specification-lab-quickcheck:local`
- `specification-lab-fitspec:local`

**Port already in use**

Check whether another frontend or backend server is already running. Stop the previous process before starting a new one.

## GitHub Pages

The frontend can also be accessed through GitHub Pages. However, QuickCheck and FitSpec execution requires a separately running backend.

For full functionality during local development, use **http://localhost:5500** with the Node.js backend and Docker Desktop running.