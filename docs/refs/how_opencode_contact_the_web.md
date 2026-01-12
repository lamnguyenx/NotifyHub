# How OpenCode Contacts the Web

This document outlines the external APIs and services that OpenCode interacts with, based on analysis of the codebase.

## Core Architecture

### Model Calling
- **Location**: `packages/opencode/src/provider/provider.ts` and related files
- **Implementation**: Uses Vercel's AI SDK libraries for model inference
- **Purpose**: Generates assistant responses via various AI model providers

### Tool System
- **WebSearch Tool** (`packages/opencode/src/tool/websearch.ts`): Opencode's web search interface that calls Exa AI MCP API (`mcp.exa.ai`)
- **CodeSearch Tool** (`packages/opencode/src/tool/codesearch.ts`): Opencode's code search interface that calls Exa AI MCP API (`mcp.exa.ai`)
- **Edit Tool** (`packages/opencode/src/tool/edit.ts`):
  - Performs file editing with LSP diagnostics integration
  - LSP integration downloads language servers from GitHub releases
- **Search tools use**: Exa AI MCP API for performing web and code searches

## External APIs Called

### AI Model Providers (can be hosted offline)
- Anthropic (`api.anthropic.com`) - Claude models
- OpenAI (`api.openai.com`) - GPT models
- Google (`generativelanguage.googleapis.com`, `vertexai.googleapis.com`) - Gemini, Vertex AI
- Mistral AI (`api.mistral.com`)
- Cohere (`api.cohere.com`)
- Groq (`api.groq.com`)
- Together AI (`api.togetherai.com`)
- xAI (`api.x.ai`) - Grok models
- Cerebras (`api.cerebras.ai`)
- DeepInfra (`api.deepinfra.com`)
- Perplexity (`api.perplexity.ai`)
- DeepSeek (`api.deepseek.com`)
- MiniMax (`api.minimax.com`)
- GLM (`api.glm.com`)
- Amazon Bedrock (`bedrock.amazonaws.com`)
- Azure OpenAI (azure endpoints)
- Gateway AI (`gateway.ai`)
- OpenRouter (`openrouter.ai`)
- Custom provider URLs

### Search & Content Services (participate in assistant messages)
- **Exa AI** (`mcp.exa.ai`) - Web search and code search via MCP
  - **Websearch tool** (`packages/opencode/src/tool/websearch.ts`): Opencode's web search interface that calls Exa AI
  - **Codesearch tool** (`packages/opencode/src/tool/codesearch.ts`): Opencode's code search interface that calls Exa AI
  - Used during conversations when the assistant needs to search the web or find code examples

### Package Management
- **NPM Registry API** (`registry.npmjs.org`, `api.npmjs.org`) - Package metadata and download stats
- **Homebrew API** (`formulae.brew.sh`) - Formula information

### GitHub Integration
- **GitHub API** (`api.github.com`) - Releases, installations, repository data
- **GitHub Actions OIDC** (`token.actions.githubusercontent.com`) - Token exchange for CI/CD

### Model Metadata (required for message generation)
- **Models.dev API** (`models.dev/api.json`) - Model metadata and capabilities

### Session Sharing
- **Opncd.ai Share Service** (`opncd.ai/api/share`) - Session sharing and synchronization

### MCP Servers
- **Remote MCP Servers** - Configurable endpoints for tool execution and resource access

### Other Utility APIs
- **Language Server Downloads** - Various GitHub releases for LSP binaries (clangd, elixir-ls, zls, terraform-ls, texlab, tinymist, kotlin-lsp, lua-language-server, etc.)
  - Triggered by Edit tool for syntax checking and error reporting
  - Downloads from GitHub releases for various language servers
- **Well-known opencode config** (`{key}/.well-known/opencode`) - Dynamic configuration endpoints for providers
- **OpenCode Installation** (`opencode.ai/install`) - Installation script download

## Network Protocols

### WebSocket Connections
- **Purpose**: Real-time PTY sessions and MCP OAuth authentication callbacks
- **Location**: Server components for interactive sessions

## Analytics and Telemetry

### Current State
- **Event tracking** sent to PostHog (`us.i.posthog.com`) when:
  - `script/stats.ts` is explicitly run
  - `POSTHOG_KEY` environment variable is set

### OpenTelemetry
- Optional AI SDK telemetry controlled by config:
```json
{
  "experimental": {
    "openTelemetry": false
  }
}
```

### Web Console Analytics
- Google Analytics mentioned in privacy policy (separate from CLI)
- Managed through browser cookie settings

## APIs Participating in Assistant Messages

These external APIs are involved in generating assistant responses:

1. **Exa AI** (`mcp.exa.ai`) - Web search and code search tools
2. **Models.dev API** (`models.dev/api.json`) - Model metadata for LLM processing
3. **MCP Servers** - Remote tool execution and resource access
4. **AI Model Providers** - Model inference for responses

## Edit Tool Integration

The Edit tool (`packages/opencode/src/tool/edit.ts`) performs file modifications and runs LSP diagnostics for error checking. While the edit operation itself is local, the LSP integration may download language servers from external sources when first used for specific file types.

**LSP Downloads triggered by Edit tool:**
- Called after file edits to check for syntax errors
- Downloads binaries from GitHub releases for various language servers
- Cached locally after first download

## Disabling External Dependencies

### Analytics
- Don't set `POSTHOG_KEY` environment variable
- Set `"openTelemetry": false` in config

### Model Providers
- Can be hosted offline or use local models
- Configure custom providers pointing to local endpoints

### Search Services
- Exa AI integration can be disabled by not using websearch/codesearch tools
- No config option currently exists to disable these tools globally

### Session Sharing
- Can be disabled by not using share features or configuring custom share URLs</content>
<parameter name="filePath">docs/refs/how_opencode_contact_the_web.md