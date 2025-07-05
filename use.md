# Agent Zero - Complete Usage Guide

Agent Zero is a sophisticated autonomous AI agent framework for complex task automation and problem-solving, running as a local Python application with web interface.

## 🚀 What is Agent Zero?

Agent Zero is an autonomous JSON-based AI agent that can execute tasks, use tools, and manage subordinate agents. It features a Flask-based web interface, extensive tool ecosystem, and support for 15+ AI providers.

## 🏗️ Core Architecture

### Agent System
- **AgentContext**: Manages agent instances, logging, and task execution
- **Agent Class**: Core agent logic with message loops, tool processing, and LLM interaction
- **ModelConfig**: Configuration for different types of models (chat, utility, embedding, browser)
- **Intervention System**: Real-time user interaction during agent execution

### Multi-Model Support
Supports 15+ AI providers:
- OpenAI (including Azure)
- Anthropic (Claude)
- Google (Gemini)
- Groq, Ollama, Hugging Face
- Mistral AI, OpenRouter, DeepSeek
- Sambanova, LM Studio
- Custom OpenAI-compatible APIs

## 🛠️ Available Tools

### Core Execution Tools

**Code Execution Tool** (`python/tools/code_execution_tool.py`)
- Execute Python, Node.js, and terminal/bash commands
- **Default runtime**: `terminal` (executes bash commands directly)
- Direct execution on host system using `subprocess.run(shell=True)`
- 5-minute timeout for long operations
- Real-time output capture with stdout/stderr separation

**Browser Agent** (`python/tools/browser_agent.py`)
- Autonomous web browsing using Playwright
- Vision-enabled browser automation
- Screenshot capture and DOM interaction
- Task-based browser control with natural language

**Search Engine** (`python/tools/search_engine.py`)
- Web search through SearXNG
- Configurable result limits
- Integrated search result formatting

### Memory Management System

**Memory Tools**
- **Memory Save**: Store information in vector database
- **Memory Load**: Retrieve memories with similarity search
- **Memory Delete/Forget**: Remove specific or query-based memories
- Uses FAISS for vector storage with HuggingFace embeddings

### Additional Tools
- **Document Query**: Query and analyze documents
- **Knowledge Tool**: Access knowledge base
- **Scheduler**: Task scheduling and automation
- **Vision Load**: Image analysis capabilities
- **Web Content Tool**: Extract and analyze web content
- **Subordinate Agent Calling**: Hierarchical agent management

## 🌐 Web Interface Features

### Flask-based Web UI
- Real-time chat interface with streaming responses
- Settings management for models, API keys, and configurations
- File browser for work directory management
- History management for chat sessions
- Speech integration (STT/TTS)
- Task scheduler interface
- MCP server management
- Backup and restore functionality

### API Endpoints (40+ endpoints)
- Chat messaging (sync/async)
- File operations
- Settings management
- History operations
- Health checks
- Transcription services
- Task scheduling
- MCP server management
- Backup operations

## 🔧 Configuration System

### Prompt System (`prompts/`)
- Modular prompt architecture with inheritance
- Multiple agent personas: default, developer, hacker, researcher
- Tool-specific prompts for each capability
- Behavior modification through prompt engineering

### Knowledge Base (`knowledge/`)
- Default knowledge: Installation guides, documentation
- Custom knowledge: User-specific information
- Solutions storage: Reusable problem-solving patterns

### Memory System (`memory/`)
- Vector embeddings using sentence-transformers
- FAISS indexing for fast similarity search
- Persistent storage across sessions
- Metadata support for categorization

## 🔌 MCP (Model Context Protocol) Integration

Extensive MCP server support for:
- GitHub integration
- Filesystem operations
- Exa web search
- Brave search
- Perplexity AI
- SearXNG
- SSH connections
- VS Code integration
- Home lab management

## 🔒 Security Features

- **SSL certificate support**: Automatic HTTPS if `ssl/cert.pem` and `ssl/key.pem` exist
- **Authentication system**: Login/password via `AUTH_LOGIN` and `AUTH_PASSWORD` env vars
- **CSRF protection**: Built-in CSRF token validation
- **API key management**: `API_KEY` environment variable for API access
- **Loopback restriction**: API access limited to localhost by default

## 🎙️ Speech Integration

- **Speech-to-Text**: OpenAI-compatible STT with Whisper
- **Text-to-Speech**: OpenAI-compatible TTS with various voices
- Real-time audio processing
- Configurable voice parameters

## 🐍 Installation & Running

### Local Python Installation
```bash
# Install dependencies
pip install -r requirements.txt

# Run web interface (recommended)
python run_ui.py

# Run CLI interface (discontinued but still works)
python run_cli.py
```

### Configuration
- **Environment variables**: Set in `.env` file or system environment
- **Web UI settings**: Configure through web interface
- **Port configuration**: Default port via `WEB_UI_PORT` env var
- **Host binding**: Set via `WEB_UI_HOST` env var (default: localhost)

### Key Environment Variables
- `AUTH_LOGIN` / `AUTH_PASSWORD`: Web UI authentication
- `API_KEY`: API access key
- `WEB_UI_PORT`: Web server port
- `WEB_UI_HOST`: Web server host
- `FLASK_SECRET_KEY`: Flask session security

## 💡 What You Can Do with Agent Zero

### 1. Autonomous Task Execution
- Deploy AI agents that independently solve complex problems
- Chain multiple tasks together
- Handle errors and adapt to changing conditions

### 2. Code Development & System Administration
- **Execute bash commands by default** (no runtime specification needed)
- Write, execute, and debug code in Python and Node.js
- File system operations and directory management
- Process monitoring and system administration

### 3. Web Automation
- Automate web browsing and data extraction
- Form filling and submission
- Screenshot capture and visual analysis

### 4. Research and Analysis
- Conduct comprehensive web research
- Analyze documents and synthesize information
- Generate reports and summaries

### 5. Memory Management
- Build persistent knowledge bases
- Retrieve relevant information from past interactions
- Categorize and organize information

### 6. Multi-Agent Orchestration
- Deploy hierarchical agent systems
- Coordinate complex workflows
- Delegate tasks to specialized agents

### 7. Custom Tool Development
- Extend capabilities through custom tools
- Integrate with external services
- Build domain-specific functionality

### 8. API Integration
- Connect with external services through MCP
- Direct API calls and data processing
- Webhook handling and event processing

### 9. Real-time Interaction
- Interrupt and guide agent execution
- Provide real-time feedback during streaming
- Adjust strategies on the fly

## 🎯 Common Use Cases

### Development & DevOps
- Code generation and testing
- System monitoring and automation
- File management and batch operations
- Log analysis and debugging

### Business Automation
- Data processing and analysis
- Report generation
- Content creation and management
- Research and competitive analysis

### System Administration
- Server monitoring and maintenance
- Backup automation
- Security auditing
- Performance optimization

## 🚀 Getting Started

1. **Install Dependencies**: `pip install -r requirements.txt`
2. **Configure Environment**: Set up `.env` file with API keys
3. **Start Web Interface**: `python run_ui.py`
4. **Access UI**: Open browser to `http://localhost:8000` (or your configured port)
5. **First Agent**: Create your first agent and give it a task
6. **Explore Tools**: Try code execution, web browsing, and memory features

## 🔄 Advanced Features

### Code Execution
- **Default behavior**: Executes bash/terminal commands directly
- **Python execution**: Use `runtime: python` parameter
- **Node.js execution**: Use `runtime: nodejs` parameter
- **Direct system access**: No containerization, runs on host

### Error Handling
- Robust exception management
- Automatic recovery mechanisms
- Detailed error logging

### Performance Optimization
- Rate limiting for API calls
- Efficient resource usage
- Caching mechanisms

### Monitoring and Logging
- Comprehensive execution tracking
- Performance metrics
- Debug capabilities

## 📈 Technical Architecture

### Flask Web Application
- **Main server**: `run_ui.py` - Flask app with API endpoints
- **CLI interface**: `run_cli.py` - Command-line interface (discontinued)
- **Middleware**: MCP server integration at `/mcp` endpoint
- **Security**: Basic auth, CSRF protection, API key validation

### Tool System
- **Tool loading**: Dynamic tool discovery from `python/tools/`
- **API handlers**: Auto-registered from `python/api/`
- **Helper modules**: Extensive utility functions in `python/helpers/`

### Agent Management
- **Agent context**: Centralized agent state management
- **Message loops**: Asynchronous agent communication
- **Intervention system**: Real-time user interaction
- **History tracking**: Persistent conversation history

This Agent Zero implementation is a mature, production-ready autonomous AI agent framework designed for local deployment with extensive customization options and direct system access.