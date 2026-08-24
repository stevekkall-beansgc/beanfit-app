// Stack generator: turns device profile + user choices into runnable setup.
// Pure and testable. The user's overrides are honored even when we disagree —
// with honest warnings.

import { fits } from "./fit.js";

export const INTERFACES = {
  terminal: {
    label: "Terminal chat",
    plain: "Simplest possible: type, get answers, all in the Terminal app",
    requiresDocker: false,
  },
  webui: {
    label: "Private chat in your browser",
    plain: "A ChatGPT-style app running on your machine via Docker",
    requiresDocker: true,
  },
};

// The model catalog the configurator offers. Kept in sync with the CLI
// catalog; params/mem mirror catalog/models.py.
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

export function generateStack(profile, choices) {
  const iface = INTERFACES[choices.interface] ? choices.interface : "terminal";
  const tag = MODELS[choices.model_tag] ? choices.model_tag : "gemma4:31b";
  const model = MODELS[tag];
  const warnings = [];
  const steps = [];

  // Honest fit check against the stored profile (nulls = browser estimate).
  if (profile?.model_budget_gib != null) {
    const check = fits(model, profile);
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

  steps.push({
    title: "Install Ollama (runs the AI on this machine)",
    detail: "Download the free app from ollama.com and open it once.",
  });
  steps.push({
    title: "Download your model (one time)",
    code: `ollama pull ${tag}`,
  });

  let files = [];
  if (iface === "webui") {
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
      detail: "http://localhost:3000 — create a local account (stays on your machine) and pick your model.",
    });
    files.push({
      name: "docker-compose.yml",
      content: composeFile(tag),
    });
  } else {
    steps.push({
      title: "Start chatting",
      code: `ollama run ${tag}`,
    });
  }

  return {
    interface: iface,
    model_tag: tag,
    warnings,
    steps,
    files,
    generated_at: new Date().toISOString(),
  };
}

function composeFile(tag) {
  return `# beanfit stack — private AI chat on your machine
# The AI runs natively (fast, uses your Mac's GPU); the chat interface
# runs in Docker and talks to it. Start with:  docker compose up -d
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
