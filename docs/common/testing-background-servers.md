# Testing Background Server Applications

## Overview

Many applications (web servers, APIs, services) run continuously and block the terminal when started normally. This guide covers strategies for testing such applications without blocking your development workflow.

## Quick Reference

### Essential Commands
```bash
# Start service in background
<your-server-command> &

# Wait for startup (adjust time as needed)
sleep 2

# Test basic connectivity
curl http://localhost:<port>/health

# Cleanup service
pkill -f "<service-pattern>"
```

### Common Patterns
```bash
# Full test cycle
<your-server-command> &
sleep 2
<your-test-commands>
pkill -f "<service-pattern>"
```

```bash
# With process tracking
<your-server-command> &
SERVICE_PID=$!
sleep 2
# Run tests...
kill $SERVICE_PID
```

### Streaming/Real-time Testing
```bash
# Test streaming endpoint
curl -H "Accept: text/event-stream" http://localhost:<port>/events &
STREAM_PID=$!
# Send test data...
kill $STREAM_PID
```

### Cleanup Commands
```bash
# Kill by command pattern
pkill -f "<unique-pattern>"

# Kill by port
kill $(lsof -ti:<port>)

# Check what's running
ps aux | grep <process-name>
lsof -i :<port>
netstat -tulpn | grep :<port>
```

## The Problem

When you run a server application normally:
```bash
python -m myapp.server --port 8080
# Server starts and blocks terminal - no further commands possible
```

This prevents running subsequent test commands or debugging in the same session.

## Solutions

### 1. Background Execution with `&`

**Basic Usage:**
```bash
# Start server in background
python -m myapp.server --port 8080 &

# Server runs in background, terminal is free
# Can now run tests, curl commands, etc.
```

**Advanced Usage:**
```bash
# Start server and capture process ID
python -m myapp.server --port 8080 &
SERVER_PID=$!

# Run your tests
curl http://localhost:8080/api/test
npm test

# Cleanup when done
kill $SERVER_PID
```

### 2. Using `timeout` for Controlled Testing

**Quick Tests:**
```bash
# Run server for 30 seconds, then auto-terminate
timeout 30 python -m myapp.server --port 8080 &
sleep 2  # Wait for startup
# Run tests
curl http://localhost:8080/api/health
```

### 3. Process Management Tools

**Using `screen` or `tmux`:**
```bash
# Start detached screen session
screen -dmS myserver python -m myapp.server --port 8080

# Later, attach to check logs
screen -r myserver

# Detach with Ctrl+A, D
```

**Using `nohup`:**
```bash
# Run server immune to hangups
nohup python -m myapp.server --port 8080 &

# Output goes to nohup.out
tail -f nohup.out
```

## Testing Patterns

### API Endpoint Testing

```bash
# Start server in background
python -m myapp.server --port 8080 &
sleep 2

# Test endpoints
curl http://localhost:8080/api/health
curl -X POST http://localhost:8080/api/data -d '{"test": "data"}'

# Cleanup
pkill -f "myapp.server"
```

### WebSocket/SSE Testing

```bash
# Start server
python -m myapp.server --port 8080 &
sleep 2

# Test SSE endpoint
curl -H "Accept: text/event-stream" http://localhost:8080/events &
SSE_PID=$!

# Send test data
curl -X POST http://localhost:8080/api/notify -d '{"message": "test"}'

# Check if SSE received data
sleep 1
kill $SSE_PID

# Cleanup server
pkill -f "myapp.server"
```

### Integration Testing

```bash
#!/bin/bash
# integration_test.sh

# Start server
python -m myapp.server --port 8080 &
SERVER_PID=$!

# Wait for startup
sleep 3

# Run test suite
npm test
TEST_EXIT=$?

# Run API tests
curl -f http://localhost:8080/api/health
API_EXIT=$?

# Cleanup
kill $SERVER_PID

# Exit with combined status
exit $((TEST_EXIT || API_EXIT))
```

### Load Testing

```bash
# Start server
python -m myapp.server --port 8080 &
sleep 2

# Run load test
ab -n 1000 -c 10 http://localhost:8080/api/test

# Monitor logs in another terminal
tail -f logs/server.log

# Cleanup
pkill -f "myapp.server"
```

## Cleanup Strategies

### Process-Based Cleanup

```bash
# Kill by command pattern
pkill -f "myapp.server"

# Kill by port (if you know the process uses lsof)
kill $(lsof -ti:8080)

# Kill all Python processes (dangerous!)
pkill python
```

### Port-Based Cleanup

```bash
# Find process using port
lsof -ti:8080 | xargs kill -9

# Or using netstat
netstat -tulpn | grep :8080
```

### Robust Cleanup Function

```bash
cleanup() {
    echo "Cleaning up..."
    pkill -f "myapp.server" 2>/dev/null || true
    pkill -f "test_script" 2>/dev/null || true
}

# Set trap to cleanup on script exit
trap cleanup EXIT INT TERM

# Your test code here
python -m myapp.server --port 8080 &
sleep 2
# Run tests...
```

## Best Practices

### 1. Always Wait for Startup

```bash
# Bad - races with startup
python -m myapp.server --port 8080 &
curl http://localhost:8080/api/test

# Good - wait for ready
python -m myapp.server --port 8080 &
sleep 3  # Or check health endpoint
curl http://localhost:8080/api/test
```

### 2. Check Server Health

```bash
# Wait for health endpoint
python -m myapp.server --port 8080 &
timeout 30 bash -c 'until curl -f http://localhost:8080/health; do sleep 1; done'
```

### 3. Use Descriptive Process Names

```bash
# Hard to kill specifically
python app.py &

# Better
python -m myapp.server --port 8080 &
# Can kill with: pkill -f "myapp.server"
```

### 4. Log Everything

```bash
# Start with logging
python -m myapp.server --port 8080 > server.log 2>&1 &
tail -f server.log &
```

### 5. Test in Isolation

```bash
# Use unique ports for parallel tests
TEST_PORT=8081
python -m myapp.server --port $TEST_PORT &
sleep 2
curl http://localhost:$TEST_PORT/api/test
pkill -f "myapp.server"
```

## Common Pitfalls

### Race Conditions

```bash
# Problem: Test runs before server is ready
python -m myapp.server --port 8080 &
curl http://localhost:8080/api/test  # May fail

# Solution: Add delay or health check
python -m myapp.server --port 8080 &
sleep 3
curl http://localhost:8080/api/test
```

### Port Conflicts

```bash
# Problem: Port already in use
python -m myapp.server --port 8080 &
# Error: [Errno 98] Address already in use

# Solution: Kill existing processes first
pkill -f "myapp.server"
sleep 1
python -m myapp.server --port 8080 &
```

### Zombie Processes

```bash
# Problem: Processes don't die cleanly
python -m myapp.server --port 8080 &
# Ctrl+C doesn't kill background process

# Solution: Use process groups or proper cleanup
python -m myapp.server --port 8080 &
SERVER_PID=$!
# ... tests ...
kill $SERVER_PID 2>/dev/null || kill -9 $SERVER_PID
```

### Resource Leaks

```bash
# Problem: Multiple servers accumulate
for i in {1..5}; do
    python -m myapp.server --port 808$i &
done
# Now have 5 servers running

# Solution: Track and cleanup
PIDS=()
for i in {1..5}; do
    python -m myapp.server --port 808$i &
    PIDS+=($!)
done

# Cleanup all
for pid in "${PIDS[@]}"; do
    kill $pid 2>/dev/null || true
done
```

## Tools and Utilities

### Process Monitoring

```bash
# See all Python processes
ps aux | grep python

# Tree view of processes
pstree -p

# Monitor port usage
netstat -tulpn | grep :8080
```

### Testing Frameworks

```bash
# Python testing with server
pytest --tb=short -v tests/

# With server fixture (pytest)
@pytest.fixture(scope="session", autouse=True)
def server():
    proc = subprocess.Popen(["python", "-m", "myapp.server", "--port", "8080"])
    time.sleep(2)  # Wait for startup
    yield proc
    proc.kill()
```

### Docker Alternative

```bash
# Run server in Docker for isolation
docker run -d -p 8080:8080 myapp:latest
# Test against container
curl http://localhost:8080/api/test
docker stop $(docker ps -q --filter ancestor=myapp)
```

## Examples by Framework

### FastAPI/Uvicorn

```bash
# Standard
uvicorn main:app --host 0.0.0.0 --port 8080 &
sleep 2
curl http://localhost:8080/docs

# With reload (for development)
uvicorn main:app --reload --host 0.0.0.0 --port 8080 &
```

### Node.js/Express

```bash
# Standard
npm start &
sleep 2
curl http://localhost:3000/api/health

# With nodemon
npx nodemon app.js &
```

### Django

```bash
# Development server
python manage.py runserver 8080 &
sleep 3  # Django is slower to start
curl http://localhost:8080/admin/
```

## Troubleshooting

### Server Won't Start

```bash
# Check port availability
lsof -i :8080

# Check for errors in startup
python -m myapp.server --port 8080 2>&1 | head -20

# Try different port
python -m myapp.server --port 8081 &
```

### Tests Fail Intermittently

```bash
# Add more startup delay
python -m myapp.server --port 8080 &
sleep 5  # Increase if needed

# Or poll for readiness
timeout 30 bash -c 'until curl -f http://localhost:8080/health; do sleep 1; done'
```

### High Resource Usage

```bash
# Monitor server process
top -p $SERVER_PID

# Check logs for issues
tail -f server.log

# Kill and restart if needed
kill $SERVER_PID
sleep 1
python -m myapp.server --port 8080 &
```

This guide covers the essential patterns for testing background server applications. The key principles are: start in background, wait for readiness, test thoroughly, and cleanup properly.
