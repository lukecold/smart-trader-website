// Shared LLM provider registry used by the create form and the replicate modal.
// The provider list mirrors the backend's composer providers (getBaseURL); the
// presets are only a fallback while the live /strategies/models list loads.

export interface LLMProviderOption {
  value: string;
  label: string;
}

export const LLM_PROVIDERS: LLMProviderOption[] = [
  { value: "deepseek", label: "DeepSeek" },
  { value: "openrouter", label: "OpenRouter" },
  { value: "openai", label: "OpenAI" },
  { value: "google", label: "Google" },
  { value: "kimi", label: "Kimi (Moonshot)" },
];

export const MODEL_PRESETS: Record<string, string[]> = {
  deepseek: ["deepseek-v4-pro", "deepseek-v4-flash"],
  openai: ["gpt-4o", "gpt-4o-mini", "o3-mini", "o1-mini"],
  openrouter: [
    "deepseek/deepseek-r1",
    "meta-llama/llama-3.3-70b-instruct",
    "anthropic/claude-3-5-sonnet",
    "google/gemini-2.0-flash-001",
  ],
  google: ["gemini-2.0-flash-001", "gemini-2.0-flash-thinking-exp", "gemini-1.5-pro"],
  kimi: ["kimi-k2-0905-preview", "kimi-k2-turbo-preview", "kimi-latest"],
};
