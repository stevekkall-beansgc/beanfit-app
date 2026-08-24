// Plain-language translation of technical fit data.
// The product rule: lead with what the user can DO; specs live in <details>.

// Response speed → everyday experience.
export function speedBand(tokS) {
  if (tokS == null) return null;
  if (tokS >= 30) return { label: "Instant", plain: "Responds faster than you can read" };
  if (tokS >= 12) return { label: "Fast", plain: "About as quick as someone typing" };
  if (tokS >= 5) return { label: "Steady", plain: "Comfortable if you're patient" };
  return { label: "Slow", plain: "Works, but long answers take a while" };
}

// Per-model plain descriptions (keyed by ollama tag; kept in sync with the
// CLI catalog). Fallback tiers use weight size when a model is unknown.
const MODEL_INFO = {
  "qwen3.5:9b": {
    role: "Quick helper",
    blurb: "Snappy answers for everyday stuff",
    tasks: ["Answer everyday questions", "Summarize notes and articles", "Draft short emails and texts"],
  },
  "phi4-reasoning:14b": {
    role: "Step-by-step thinker",
    blurb: "Careful, methodical problem solving",
    tasks: ["Work through math step by step", "Explain logic problems", "Double-check reasoning for mistakes"],
  },
  "gpt-oss:20b": {
    role: "Smart all-rounder",
    blurb: "The dependable daily driver",
    tasks: ["Draft and edit documents", "Write and fix code", "Follow detailed instructions"],
  },
  "gemma4:31b": {
    role: "Smart all-rounder",
    blurb: "Great everyday brain",
    tasks: ["Answer questions with nuance", "Draft long documents", "Help with code"],
  },
  "qwen3.6:35b-a3b": {
    role: "Big smarts, quick feet",
    blurb: "Near top-tier quality that still feels fast",
    tasks: ["High-quality writing at speed", "Analyze long documents", "Solid coding help"],
  },
  "llama4:scout": {
    role: "All-rounder",
    blurb: "Balanced general use",
    tasks: ["General questions", "Summaries", "Brainstorming"],
  },
  "deepseek-coder-v2:16b": {
    role: "Coding specialist",
    blurb: "Built for software work",
    tasks: ["Write new code", "Find and fix bugs", "Explain unfamiliar code"],
  },
  "mistral-small3.2": {
    role: "All-rounder",
    blurb: "Solid general-purpose assistant",
    tasks: ["Everyday assistant tasks", "Drafting", "Q&A"],
  },
  "kimi-k2.6": {
    role: "Heavyweight brain",
    blurb: "Frontier-class smarts",
    tasks: ["The hardest reasoning problems", "Long, complex documents", "Expert-level coding"],
  },
};

// Task menu per device tier — the "what can I actually do" answer.
export function deviceTasks(budgetGib) {
  if (budgetGib == null) return [];
  const base = ["Chat privately about anything", "Summarize documents and articles", "Draft emails and notes"];
  if (budgetGib < 6) return base;
  const mid = [...base, "Write and fix code", "Work through math and logic step by step"];
  if (budgetGib < 25) return mid;
  if (budgetGib < 60) return [...mid, "Run several assistants at once", "Analyze long reports"];
  return [...mid, "Run the strongest open models available", "Tackle expert-level problems"];
}

export function modelInfo(tag, totalGib) {
  if (MODEL_INFO[tag]) return MODEL_INFO[tag];
  if (totalGib != null && totalGib < 10)
    return { role: "Quick helper", blurb: "Snappy answers for everyday tasks", tasks: ["Everyday questions", "Summaries", "Short drafts"] };
  if (totalGib != null && totalGib <= 30)
    return { role: "Smart all-rounder", blurb: "Strong writing and coding help", tasks: ["Draft documents", "Write and fix code", "Detailed instructions"] };
  return { role: "Heavyweight brain", blurb: "The smartest models — slower, for hard problems", tasks: ["Hard reasoning problems", "Long complex documents"] };
}

// What the device can do, in one sentence.
export function capabilityHeadline(budgetGib) {
  const tasks = deviceTasks(budgetGib);
  if (budgetGib == null)
    return {
      headline: "We couldn't measure this device fully yet",
      detail: "Approve the beanfit app on this machine for exact numbers and picks.",
      tasks: [],
    };
  if (budgetGib < 6)
    return {
      headline: "On this device you can:",
      detail: "Compact AI — quick helpers, private and free.",
      tasks,
    };
  if (budgetGib < 25)
    return {
      headline: "On this device you can:",
      detail: "Serious AI — private and free.",
      tasks,
    };
  if (budgetGib < 60)
    return {
      headline: "On this device you can:",
      detail: "Advanced AI with room to spare — private and free.",
      tasks,
    };
  return {
    headline: "On this device you can:",
    detail: "The biggest AI models available — private and free.",
    tasks,
  };
}

export const PROMISES = [
  "Private — conversations never leave this device",
  "Free — no subscription, no usage fees",
  "Works offline — no internet needed after setup",
];

// The three picks worth showing a normal person.
export function plainPicks(ranked) {
  const fits = (ranked ?? []).filter(r => r.fits && r.est_tok_s != null);
  if (!fits.length) return [];
  const best = fits[0]; // ranked is score-desc
  const quickest = fits.reduce((a, b) => (b.est_tok_s > a.est_tok_s ? b : a), fits[0]);
  const smartest = fits.reduce((a, b) => (b.quality > a.quality ? b : a), fits[0]);
  const picks = [{ key: "Best for most people", row: best }];
  if (quickest !== best) picks.push({ key: "If you want more speed", row: quickest });
  if (smartest !== best && smartest !== quickest) picks.push({ key: "If you want maximum smarts", row: smartest });
  return picks.slice(0, 3);
}
