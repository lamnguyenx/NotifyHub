# Coding Agent Workflow Guide

## How to Work with Users on Web Service Development

When developing and testing a web service, follow this workflow:

### Step 1: Request Server Setup

**Tell the user:**
> "Please start the backend server in a separate terminal by running:
> ```bash
> make backend
> ```
> This will start FastAPI on port 9080 with auto-reload enabled."

**Then tell the user:**
> "Please start the frontend dev server in another separate terminal by running:
> ```bash
> make frontend-dev
> ```
> This will start Vite on port 9070 with hot-reloading and proxy to the backend."

**Finally:**
> "Once both servers are running, please let me know so I can proceed with code modifications and testing."

### Step 2: Wait for Confirmation

Do not proceed until the user confirms both servers are running successfully.

### Step 3: Development Cycle

Once servers are confirmed running:
- Make code changes to files as needed
- Run automated tests: `make test-frontend-dev`
- Both servers will automatically detect changes and reload
- No need to ask user to restart servers between iterations
- Changes will be visible at `http://localhost:9070`

### Important Notes

- **Never** try to start servers in the background yourself
- **Always** wait for user confirmation before running tests
- **Remember** that servers auto-reload, so you only need to edit code
- **Communicate** clearly when you're making changes that should trigger a reload
