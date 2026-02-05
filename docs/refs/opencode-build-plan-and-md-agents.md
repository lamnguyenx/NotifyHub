# Build and Plan Modes vs. Markdown-Based Agents

## Overview

OpenCode provides different mechanisms for controlling AI behavior: **built-in modes (Build/Plan)** and **custom agents (JSON or Markdown-based)**. Understanding the relationship between these concepts is crucial for effective configuration.

---

## Built-in Modes: Build and Plan

### Build Mode

- **Purpose**: Default development mode with full capabilities
- **Tool Access**: All tools enabled (read, write, edit, bash, etc.)
- **Permissions**: Permissive by default
- **Use Case**: Implementation work, refactoring, testing changes
- **Switching**: Use Tab key or configured keybind

### Plan Mode

- **Purpose**: Restricted planning and analysis mode
- **Tool Access**: Limited by default:
  - `write`: Only allowed for `.opencode/plans/*.md` files
  - `edit`: Restricted to plan files
  - `bash`: Read-only commands only
  - All other file modifications blocked
- **Permissions**: Designed for read-only analysis with structured planning workflow
- **Use Case**: Requirements gathering, architectural planning, code analysis
- **Workflow**: Follows Phase 1-5 workflow with subagent utilization

### Mode Switching Behavior

When switching between modes, OpenCode injects system reminders:

#### Build → Plan (Restrictive Switch)
- Generates detailed system-reminder with:
  - CRITICAL constraints
  - Phase 1-5 workflow instructions
  - Plan file location information
  - Hidden flags reference for plan completion
- Dynamically generated based on session state

#### Plan → Build (Liberating Switch)
- Injects short reminder from `build-switch.txt`:
  ```
  <system-reminder>
  Your operational mode has changed from plan to build.
  You are no longer in read-only mode.
  You are permitted to make file changes, run shell commands, and utilize your arsenal of tools as needed.
  </system-reminder>
  ```
- Includes plan file reference if one exists

**Note**: The asymmetry in reminder detail is intentional - Plan mode requires more explicit guidance due to its restrictive nature.

---

## Custom Agents

### Agent Configuration Methods

#### 1. JSON Configuration

```json
// ~/.config/opencode/opencode.json or .opencode/config.json
{
  "agent": {
    "build_harder": {
      "description": "Enhanced Build mode",
      "mode": "primary",
      "prompt": "Follow standard Build behavior plus: ...",
      "permission": {
        // Permission rules
      }
    }
  }
}
```

#### 2. Markdown-Based Agents

```markdown
// ~/.config/opencode/agents/example.md or .opencode/agents/example.md
---
description: "Agent description"
mode: primary  # or subagent
prompt: "Custom instructions"
permission:
  read: allow
  edit: deny
---

## Documentation

Detailed instructions about agent usage.
```

### Agent Location Hierarchy

1. **Global**: `~/.config/opencode/agents/`
2. **Project**: `.opencode/agents/` (overrides global)

---

## Relationship Between Modes and Agents

### Key Differences

| Feature | Build/Plan Modes | Custom Agents |
|---------|------------------|---------------|
| **Scope** | Global operating modes | Task-specific behaviors |
| **System Prompt** | Shared across all agents | Custom per agent |
| **Permissions** | Mode-based restrictions | Agent-specific rules |
| **Model** | Inherits session model | Can override or inherit |
| **Persistence** | Session-level state | Configuration-based |

### How They Interact

1. **Agents work within modes**:
   - When you start an agent, it operates within the current mode's constraints
   - Example: "build_harder" agent in Plan mode will still be read-only

2. **Mode switching affects agents**:
   - Switching modes changes permissions for all agents
   - Agents inherit the current mode's permission context

3. **Agents cannot override mode constraints**:
   - If Plan mode disables `bash`, no agent can enable it
   - Permission rules in agents are **merged with** mode restrictions

### Practical Example

```
// Configuration
{
  "agent": {
    "build_harder": {
      "mode": "primary",
      "prompt": "Always optimize performance...",
      "permission": {
        "bash": "allow"
      }
    }
  }
}

// Usage scenarios:
1. In Build mode: Agent has full access + custom prompt
2. In Plan mode: Agent has Plan restrictions + custom prompt
   - The "bash: allow" in agent config is **overridden** by Plan mode
```

---

## Best Practices

### For Build Mode Users

1. Use Build mode for implementation work requiring file modifications
2. Create custom agents to add domain-specific instructions
3. Switch to Plan mode when you need to analyze without making changes

### For Plan Mode Users

1. Follow the Phase 1-5 workflow
2. Use subagents for parallel exploration
3. Remember: Only `.opencode/plans/*.md` files can be modified
4. Use `plan_exit` tool when planning is complete

### For Agent Creators

1. **Don't specify models** in agents unless you need model-specific behavior
   - Agents inherit the current session's model by default
2. **Be explicit about mode requirements** in agent documentation
   - Example: "This agent works best in Build mode"
3. **Use permission rules** to add constraints within mode boundaries
4. **Store agents in appropriate locations**:
   - Global agents: `~/.config/opencode/agents/`
   - Project-specific: `.opencode/agents/`

---

## Technical Implementation Details

### System Prompt Construction

All agents use the same core system prompt components:
- Provider-specific base prompts (loaded from text files)
- Global rules from `AGENTS.md`, `CLAUDE.md`, etc.
- Custom instructions from configuration
- **Agent-specific prompt** (added as supplemental instructions)

The system prompt is **not different** between Build and Plan modes, but:
- **Tool availability** changes based on mode
- **Permission enforcement** is stricter in Plan mode
- **Reminders** are injected as synthetic messages

### Mode Switch Implementation

See: `/src/session/prompt.ts:insertReminders()`

The function:`insertReminders()` handles:
1. Detection of mode changes between consecutive messages
2. Injection of synthetic reminder messages
3. Generation of dynamic workflow instructions for Plan mode
4. Plan file existence checks and references

---

## Advanced Configuration Example

```json
{
  "agent": {
    "docreview": {
      "description": "Review documentation files",
      "mode": "primary",
      "prompt": "Analyze documentation for clarity and completeness...",
      "permission": {
        "read": {
          "*": "allow",
          "*.md": "allow",
          "*.markdown": "allow"
        },
        "bash": "deny",
        "edit": "deny"
      }
    }
  }
}
```

This agent works in both modes but:
- In Build mode: Has read-only access to docs
- In Plan mode: Subject to Plan mode's stricter constraints
- Always applies its custom prompt regardless of mode

---

## Troubleshooting

### "Agent isn't following my instructions in Plan mode"

**Cause**: Mode restrictions override agent permissions.

**Solution**: 
1. Check that your agent's instructions align with Plan mode constraints
2. Use Plan mode specifically for planning, Build mode for implementation
3. Consider creating mode-specific agents with different instructions

### "I switched modes but don't see the reminder"

**Cause**: Reminder injection might have failed.

**Solution**: 
1. Ensure you're actually switching modes (check mode indicator)
2. Verify no errors in OpenCode logs
3. Try manually mentioning the new mode in your message

---

## References

- Mode configuration: `/docs/modes.mdx`
- Agent configuration: `/docs/agents.mdx`
- Permission system: `/docs/permissions.mdx`
- Prompt implementation: `/src/session/prompt.ts`
- System prompt builder: `/src/session/system.ts`
