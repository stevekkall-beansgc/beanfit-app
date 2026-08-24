// Stack generator: turns device profile + user choices into runnable setup.
// Pure and testable. The user's overrides are honored even when we disagree —
// with honest warnings. Surfaces = the tasks/tools the user operates in.

import { fits } from "./fit.js";

export const SURFACES = {
  chat_webui: {
    label: "Chat in a private browser app",
    plain: "A ChatGPT-style app on your machine (needs Docker, free)",
    requiresDocker: true,
  },
  chat_terminal: {
    label: "Chat in Terminal",
    plain: "Simplest possible: type, get answers",
    requiresDocker: false,
  },
  code_opencode: {
    label: "Code with an AI agent in my terminal",
    plain: "opencode — an open-source coding agent that reads and edits your projects",
    requiresDocker: false,
  },
  edit_continue: {
    label: "AI help inside my editor",
    plain: "Continue — chat and autocomplete inside VS Code / JetBrains",
    requiresDocker: false,
  },
  api: {
    label: "Use the AI from my own scripts",
    plain: "Your machine serves an OpenAI-compatible API any tool can call",
    requiresDocker: false,
  },
};

// The model catalog the configurator offers. Mirrors the CLI catalog.
const MODELS = {
  "qwen3.5:9b": { name: "Qwen3.5 9B", mem_q4: 6.2, kv32k: 0.9 },
  "phi4-reasoning:14b": { name: "Phi-4-reasoning 14B", mem_q4: 9.3, kv32k: 1.2 },
  "gpt-oss:20b": { name: "gpt-oss 20B", mem_q4: 12.5, kv32k: 1.4 },
  "deepseek-coder-v2:16b": { name: "DeepSeek Coder V2 16B", mem_q4: 10.5, kv32k: 1.3 },
  "llama4:scout": { name: "Llama 4 Scout 17B", mem_q4: 11.0, kv32k: 1.5 },
  "mistral-small3.2": { name: "Mistral Small 3.2 24B", mem_q4: 15.0, kv32k: 1.6 },
  "gemma4:31b": { name: "Gemma 4 31B", mem_q4: 19.5, kv32k: 1.8 },
  "qwen3.6:35b-a3b": { name: "Qwen3.6 35B MoE", mem_q4: 21.5, kv32k: 1.9 },
  "kimi-k2.6": { name: "Kimi K2.6", mem_q4: 640, kv32k: 6.0 },
};

export function modelChoices() {
  return Object.entries(MODELS).map(([tag, m]) => ({ tag, name: m.name }));
}

// Context window the machine can afford for this model (KV cache room).
export function contextRec(profile, tag) {
  const model = MODELS[tag];
  if (!profile?.model_budget_gib || !model) return null;
  const left = profile.model_budget_gib - model.mem_q4;
  if (left <= 0) return null;
  const tokens = Math.floor((left / model.kv32k) * 32768 + 1e-6); // epsilon: inputs are estimates
  for (const step of [131072, 65536, 32768, 16384, 8192, 4096]) {
    if (tokens >= step) return step;
  }
  return 2048;
}

function humanCtx(tokens) {
  if (tokens >= 131072) return `${tokens / 1024}k tokens (whole books at once)`;
  if (tokens >= 32768) return `${tokens / 1024}k tokens (long documents at once)`;
  return `${tokens / 1024}k tokens (several pages at once)`;
}

export function generateStack(profile, choices) {
  const surfaces = Array.isArray(choices.surfaces)
    ? choices.surfaces.filter(s => SURFACES[s])
    : [];
  const use = surfaces.length ? surfaces : ["chat_webui"];
  const tag = MODELS[choices.model_tag] ? choices.model_tag : "gemma4:31b";
  const modelName = MODELS[tag].name;
  const warnings = [];
  const steps = [];
  const files = [];

  if (profile?.model_budget_gib != null) {
    const check = fits(MODELS[tag], profile);
    if (!check.fits) {
      warnings.push(
        `This model needs more memory than this machine has. It will likely fail to load or run unusably slowly — but it's your call.`,
      );
    }
  } else {
    warnings.push(
      `We haven't measured this machine's exact memory yet, so treat this as a guess. The beanfit app on this machine gives exact numbers.`,
    );
  }

  const ctx = contextRec(profile, tag);

  // Shared foundation: runtime + model.
  steps.push({
    title: "Install Ollama (runs the AI on this machine)",
    detail: "Download the free app from ollama.com and open it once.",
  });
  steps.push({
    title: `Download ${modelName} (one time)`,
    code: `ollama pull ${tag}`,
  });
  if (ctx && ctx >= 8192) {
    steps.push({
      title: `Give it room to think: ${humanCtx(ctx)}`,
      detail: `Add this to your shell profile (~/.zshrc) so Ollama uses the context your memory allows:`,
      code: `export OLLAMA_CONTEXT_LENGTH=${ctx}`,
    });
  }

  for (const surface of use) {
    if (surface === "chat_webui") {
      steps.push({
        title: "Install Docker Desktop (free) if you don't have it",
        detail: "docker.com/products/docker-desktop — install and open it once.",
      });
      steps.push({
        title: "Save the file below as docker-compose.yml in a new folder, then run:",
        code: "docker compose up -d",
      });
      steps.push({
        title: "Open your private chat",
        detail: "http://localhost:3000 — create a local account (stays on your machine).",
      });
      files.push({ name: "docker-compose.yml", content: composeFile(tag) });
    }
    if (surface === "chat_terminal") {
      steps.push({ title: "Start chatting", code: `ollama run ${tag}` });
    }
    if (surface === "code_opencode") {
      steps.push({
        title: "Install opencode (one time)",
        code: "curl -fsSL https://opencode.ai/install | bash",
      });
      files.push({
        name: "opencode.jsonc  →  save to ~/.config/opencode/opencode.jsonc",
        content: opencodeConfig(tag, modelName, ctx),
      });
      steps.push({
        title: "Use it inside any project folder",
        code: "cd your-project && opencode",
      });
    }
    if (surface === "edit_continue") {
      steps.push({
        title: "Install the Continue extension",
        detail: "In VS Code or JetBrains: search 'Continue' in extensions, install once.",
      });
      files.push({
        name: "config.yaml  →  save to ~/.continue/config.yaml",
        content: continueConfig(tag, modelName),
      });
    }
    if (surface === "api") {
      steps.push({
        title: "Your machine now serves an OpenAI-compatible API",
        detail: "Point any tool at http://localhost:11434/v1 — no key needed.",
      });
      files.push({
        name: "example.py",
        content: apiExample(tag, modelName),
      });
    }
  }

  return {
    surfaces: use,
    model_tag: tag,
    context: ctx,
    warnings,
    steps,
    files,
    generated_at: new Date().toISOString(),
  };
}

function composeFile(tag) {
  return `# beanfit stack — private AI on your machine
# The AI runs natively (fast, uses your Mac's GPU); apps run in Docker and
# talk to it. Start with:  docker compose up -d
services:
  open-webui:
    image: ghcr.io/open-webui/open-webui:main
    ports:
      - "3000:8080"
    environment:
      - OLLAMA_BASE_URL=http://host.docker.internal:11434
    volumes:
      - open-webui:/app/backend/data
    restart: unless-stopped
volumes:
  open-webui:
`;
}

function opencodeConfig(tag, name, ctx) {
  return `// beanfit — local AI for opencode
// Your model runs on this machine; nothing leaves it.
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "ollama": {
      "npm": "@ai-sdk/openai-compatible",
      "options": { "baseURL": "http://localhost:11434/v1" },
      "models": {
        "${tag}": { "name": "${name}" }
      }
    }
  },
  "model": "ollama/${tag}"
}
`;
}

function continueConfig(tag, name) {
  return `# beanfit — local AI in your editor
name: beanfit local
version: 1.0.0
models:
  - name: ${tag}
    provider: ollama
    model: ${tag}
    roles: [chat, edit, apply]
`;
}

function apiExample(tag, name) {
  return `# beanfit — call your local AI from anywhere
# Works with any OpenAI-compatible client. Base URL: http://localhost:11434/v1

from openai import OpenAI

client = OpenAI(base_url="http://localhost:11434/v1", api_key="local")

stream = client.chat.completions.create(
    model="${tag}",
    messages=[{"role": "user", "content": "Summarize this file: ..."}],
    stream=True,
)
for chunk in stream:
    print(chunk.choices[0].delta.content or "", end="")
`;
}
