# CLI Configuration Plan

### Goal
Add command-line arguments for `port`, `host`, `sse_heartbeat_interval`, and `notifications_max_count` to allow runtime configuration, following the existing `--port` pattern.

### Analysis
- Current CLI: Only `--port` is configurable (default 9080).
- Code locations:
  - `main()` function uses `argparse` to parse `--port`.
  - `host` is hardcoded to "0.0.0.0" in `Config`.
  - `sse_heartbeat_interval` is hardcoded to 30 in `event_generator()`.
  - `notifications_max_count` is not implemented (currently unlimited).
- Need to integrate these into `argparse`, pass values to relevant functions/classes, and handle defaults.

### Proposed Changes
1. **Update `argparse` in `main()`:**
   - Add `--host` (default: "0.0.0.0")
   - Add `--sse-heartbeat-interval` (default: 30)
   - Add `--notifications-max-count` (default: None for unlimited)

2. **Modify `Config` creation:**
   - Use `args.host` instead of hardcoded "0.0.0.0".

3. **Update `SSEManager` class:**
   - Accept `heartbeat_interval` in `__init__` and pass from args.

4. **Update `NotificationStore` class:**
   - Accept `max_count` in `__init__` and enforce limit in `add()` method.

5. **Pass args to components:**
   - Instantiate `sse_manager = SSEManager(heartbeat_interval=args.sse_heartbeat_interval)`
   - Instantiate `store = NotificationStore(sse_manager=sse_manager, max_count=args.notifications_max_count)`

### Tradeoffs/Questions
- For `notifications_max_count`: When limit is reached, should we reject new notifications or rotate old ones? (Suggest: reject with error.)
- Should we add validation (e.g., port range, positive integers)?
- Any other params to include (e.g., logging level)?

### Next Steps
Review and confirm this plan, then proceed to implementation if approved.