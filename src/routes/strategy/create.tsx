import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCreateStrategy, usePrompts } from "@/api/strategies";
import type { CreateStrategyInput } from "@/types/strategy";

export function CreateStrategy() {
  const navigate = useNavigate();
  const createMutation = useCreateStrategy();
  const { data: prompts } = usePrompts();

  const [form, setForm] = useState({
    strategyName: "",
    strategyType: "PromptBasedStrategy",
    provider: "deepseek",
    modelId: "deepseek-chat",
    apiKey: "",
    exchangeId: "",
    exchangeApiKey: "",
    exchangeSecretKey: "",
    tradingMode: "virtual",
    marketType: "swap",
    marginMode: "cross",
    initialCapital: 10000,
    maxLeverage: 5,
    maxPositions: 2,
    decideInterval: 60,
    symbols: "BTC-USDT",
    promptText: "",
    templateId: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const input: CreateStrategyInput = {
      llm_model_config: {
        provider: form.provider,
        model_id: form.modelId,
        api_key: form.apiKey || undefined,
      },
      exchange_config: {
        exchange_id: form.exchangeId || undefined,
        api_key: form.exchangeApiKey || undefined,
        secret_key: form.exchangeSecretKey || undefined,
        trading_mode: form.tradingMode,
        market_type: form.marketType,
        margin_mode: form.marginMode,
      },
      trading_config: {
        strategy_name: form.strategyName,
        strategy_type: form.strategyType,
        initial_capital: form.initialCapital,
        max_leverage: form.maxLeverage,
        max_positions: form.maxPositions,
        decide_interval: form.decideInterval,
        symbols: form.symbols.split(",").map((s) => s.trim()),
        prompt_text: form.promptText || undefined,
        template_id: form.templateId || undefined,
      },
    };

    try {
      const result = await createMutation.mutateAsync(input);
      navigate(`/strategy/${result.strategy_id}`);
    } catch (err) {
      alert("Failed to create strategy: " + (err as Error).message);
    }
  };

  const update = (field: string, value: string | number) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <div className="max-w-2xl">
      <h2 className="text-2xl font-bold text-white mb-6">Create Strategy</h2>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Strategy Config */}
        <Section title="Strategy">
          <Field label="Name">
            <input
              value={form.strategyName}
              onChange={(e) => update("strategyName", e.target.value)}
              required
              placeholder="My Strategy"
            />
          </Field>
          <Field label="Type">
            <select
              value={form.strategyType}
              onChange={(e) => update("strategyType", e.target.value)}
            >
              <option value="PromptBasedStrategy">Prompt-Based</option>
              <option value="GridStrategy">Grid</option>
            </select>
          </Field>
          <Field label="Symbols (comma-separated)">
            <input
              value={form.symbols}
              onChange={(e) => update("symbols", e.target.value)}
              required
              placeholder="BTC-USDT, ETH-USDT"
            />
          </Field>
        </Section>

        {/* LLM Config */}
        <Section title="LLM Model">
          <Field label="Provider">
            <select
              value={form.provider}
              onChange={(e) => update("provider", e.target.value)}
            >
              <option value="deepseek">DeepSeek</option>
              <option value="openrouter">OpenRouter</option>
              <option value="openai">OpenAI</option>
              <option value="google">Google</option>
            </select>
          </Field>
          <Field label="Model ID">
            <input
              value={form.modelId}
              onChange={(e) => update("modelId", e.target.value)}
              required
              placeholder="deepseek-chat"
            />
          </Field>
          <Field label="API Key">
            <input
              type="password"
              value={form.apiKey}
              onChange={(e) => update("apiKey", e.target.value)}
              placeholder="sk-..."
            />
          </Field>
        </Section>

        {/* Exchange Config */}
        <Section title="Exchange">
          <Field label="Trading Mode">
            <select
              value={form.tradingMode}
              onChange={(e) => update("tradingMode", e.target.value)}
            >
              <option value="virtual">Virtual (Paper)</option>
              <option value="live">Live</option>
            </select>
          </Field>
          {form.tradingMode === "live" && (
            <>
              <Field label="Exchange">
                <select
                  value={form.exchangeId}
                  onChange={(e) => update("exchangeId", e.target.value)}
                >
                  <option value="">Select...</option>
                  <option value="binance">Binance</option>
                </select>
              </Field>
              <Field label="API Key">
                <input
                  type="password"
                  value={form.exchangeApiKey}
                  onChange={(e) => update("exchangeApiKey", e.target.value)}
                />
              </Field>
              <Field label="Secret Key">
                <input
                  type="password"
                  value={form.exchangeSecretKey}
                  onChange={(e) => update("exchangeSecretKey", e.target.value)}
                />
              </Field>
              <Field label="Market Type">
                <select
                  value={form.marketType}
                  onChange={(e) => update("marketType", e.target.value)}
                >
                  <option value="swap">Futures (Perpetual)</option>
                  <option value="spot">Spot</option>
                </select>
              </Field>
              <Field label="Margin Mode">
                <select
                  value={form.marginMode}
                  onChange={(e) => update("marginMode", e.target.value)}
                >
                  <option value="cross">Cross</option>
                  <option value="isolated">Isolated</option>
                </select>
              </Field>
            </>
          )}
        </Section>

        {/* Trading Parameters */}
        <Section title="Trading Parameters">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Initial Capital (USDT)">
              <input
                type="number"
                value={form.initialCapital}
                onChange={(e) => update("initialCapital", Number(e.target.value))}
                required
                min={1}
              />
            </Field>
            <Field label="Max Leverage">
              <input
                type="number"
                value={form.maxLeverage}
                onChange={(e) => update("maxLeverage", Number(e.target.value))}
                min={1}
                max={125}
              />
            </Field>
            <Field label="Max Positions">
              <input
                type="number"
                value={form.maxPositions}
                onChange={(e) => update("maxPositions", Number(e.target.value))}
                min={1}
              />
            </Field>
            <Field label="Decision Interval (sec)">
              <input
                type="number"
                value={form.decideInterval}
                onChange={(e) => update("decideInterval", Number(e.target.value))}
                min={10}
              />
            </Field>
          </div>
        </Section>

        {/* Strategy Prompt */}
        <Section title="Strategy Prompt">
          {prompts && prompts.length > 0 && (
            <Field label="Template">
              <select
                value={form.templateId}
                onChange={(e) => {
                  update("templateId", e.target.value);
                  const p = prompts.find((p) => p.id === e.target.value);
                  if (p) update("promptText", p.content);
                }}
              >
                <option value="">Custom prompt...</option>
                {prompts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Prompt">
            <textarea
              value={form.promptText}
              onChange={(e) => update("promptText", e.target.value)}
              rows={6}
              placeholder="Describe your trading strategy..."
              className="!h-auto"
            />
          </Field>
        </Section>

        <button
          type="submit"
          disabled={createMutation.isPending}
          className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
        >
          {createMutation.isPending ? "Creating..." : "Create Strategy"}
        </button>
      </form>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="space-y-4">
      <legend className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm text-gray-400 mb-1 block">{label}</span>
      <div className="[&>input]:w-full [&>input]:bg-gray-800 [&>input]:border [&>input]:border-gray-700 [&>input]:rounded-lg [&>input]:px-3 [&>input]:py-2 [&>input]:text-white [&>input]:text-sm [&>input]:outline-none [&>input]:focus:border-blue-500 [&>select]:w-full [&>select]:bg-gray-800 [&>select]:border [&>select]:border-gray-700 [&>select]:rounded-lg [&>select]:px-3 [&>select]:py-2 [&>select]:text-white [&>select]:text-sm [&>select]:outline-none [&>select]:focus:border-blue-500 [&>textarea]:w-full [&>textarea]:bg-gray-800 [&>textarea]:border [&>textarea]:border-gray-700 [&>textarea]:rounded-lg [&>textarea]:px-3 [&>textarea]:py-2 [&>textarea]:text-white [&>textarea]:text-sm [&>textarea]:outline-none [&>textarea]:focus:border-blue-500 [&>textarea]:resize-vertical">
        {children}
      </div>
    </label>
  );
}
