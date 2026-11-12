# Coding Agent Workflow Guide

## How to Work with Users on Web Service Development

When developing and testing the backend, follow this workflow:

### Step 1: Request Server Setup

**Tell the user:**
> "Please start the backend server in a separate terminal by running:
> ```bash
> make backend
> ```
> This will start FastAPI on port 9080."

**Then:**
> "Once the server is running, please let me know so I can proceed with code modifications and testing."

### Step 2: Wait for Confirmation

Do not proceed until the user confirms the server is running successfully.

### Step 3: Development Cycle

Once the server is confirmed running:
- Make code changes to files as needed
- Run automated tests: `make test-backend`
- The backend server does NOT auto-reload Python code changes
- If you modify backend Python files, **prompt the user to restart the backend server**
- Verify API behavior with the CLI (`python src/notifyhub/cli/cli.py '...'`) or the TUI (`make tui`)

### Important Notes

- **Never** try to start servers in the background yourself
- **Always** wait for user confirmation before running tests
- **Communicate** clearly when you're making changes that should trigger a restart
- **Check actual date** when naming files that require dates (e.g., plan documents). Use `date +%Y-%m-%d` in a subshell to get the current date in YYYY-MM-DD format

## Code Style Preferences

User typically uses shortcut imports with aliases:

```python
Coloring_Book as CB
concurrent.futures as cf
dataclasses as dc
Hanoi_Consts as HC
Hanoi_Types as HT
hanoi_utils as hu
inspect as isp
Kaldi_Consts as KC
kaldi_dir as kbd
kaldi_dir as kd
kaldi_types as kt
Mini_Test_Files as MTF
multiprocessing as mp
numpy as np
pandas as pd
pydantic as pdt
pyplot as plt
seaborn as sns
typing as tp
```

or alias, or... whatever you call it
