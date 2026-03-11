import { useParams, Link } from "react-router-dom";
import { useRef, useState, useEffect, useCallback } from "react";
import {
  useStrategyPerformance,
  useStrategyHoldings,
  usePortfolioSummary,
  useStrategyDetail,
  useEquityCurve,
  useClosePosition,
  usePruneSnapshots,
} from "@/api/strategies";
import { formatCurrency, formatPct, formatNumber, cn } from "@/lib/utils";
import { PromptSection } from "@/components/strategy/PromptSection";
import { BacktestSection } from "@/components/strategy/BacktestSection";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export function StrategyDetail() {
  const { id } = useParams<{ id: string }>();
  if (!id) return null;

  return (
    <div className="space-y-6">
      <Link to="/" className="text-sm text-gray-500 hover:text-gray-300">
        &larr; Back to Dashboard
      </Link>
      <OverviewSection id={id} />
      <EquityCurveSection id={id} />
      <HoldingsSection id={id} />
      <PromptSectionWrapper id={id} />
      <BacktestSectionWrapper id={id} />
      <TradeHistorySection id={id} />
      <ChatSection id={id} />
    </div>
  );
}

// ----- Equity Curve -----

function EquityCurveSection({ id }: { id: string }) {
  const { data: points } = useEquityCurve(id);
  const pruneMutation = usePruneSnapshots();
  const [pruning, setPruning] = useState(false);

  const handlePrune = async () => {
    const input = window.prompt(
      "Remove datapoints below this portfolio value (e.g. 2900):"
    );
    if (!input) return;
    const minValue = parseFloat(input);
    if (isNaN(minValue) || minValue <= 0) {
      alert("Please enter a valid positive number.");
      return;
    }
    setPruning(true);
    try {
      const result = await pruneMutation.mutateAsync({ id, minValue });
      alert(`Removed ${(result as { deleted?: number })?.deleted ?? 0} snapshot(s).`);
    } catch {
      alert("Failed to prune snapshots.");
    } finally {
      setPruning(false);
    }
  };

  if (!points || points.length < 2) return null;

  const formatted = points.map((p) => ({
    time: new Date(p.ts).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
    value: p.totalValue,
  }));

  const first = formatted[0].value;
  const last = formatted[formatted.length - 1].value;
  const isUp = last >= first;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Equity Curve</h3>
        <button
          onClick={handlePrune}
          disabled={pruning}
          className="text-xs px-2.5 py-1 rounded bg-gray-700 text-gray-400 hover:bg-gray-600 hover:text-gray-200 disabled:opacity-40 transition-colors"
          title="Remove outlier datapoints below a threshold"
        >
          {pruning ? "Pruning…" : "Remove Outliers"}
        </button>
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={formatted} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
            <defs>
              <linearGradient id="equity-grad" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor={isUp ? "#22c55e" : "#ef4444"}
                  stopOpacity={0.3}
                />
                <stop
                  offset="95%"
                  stopColor={isUp ? "#22c55e" : "#ef4444"}
                  stopOpacity={0.02}
                />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis
              dataKey="time"
              tick={{ fill: "#6b7280", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fill: "#6b7280", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => `$${v.toLocaleString()}`}
              width={72}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#111827",
                border: "1px solid #374151",
                borderRadius: "8px",
                color: "#f9fafb",
                fontSize: 12,
              }}
              formatter={(v: number) => [`$${v.toLocaleString()}`, "Value"]}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={isUp ? "#22c55e" : "#ef4444"}
              strokeWidth={2}
              fill="url(#equity-grad)"
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ----- Overview (Performance + Portfolio merged) -----

function OverviewSection({ id }: { id: string }) {
  const { data: perf } = useStrategyPerformance(id);
  const { data: port } = usePortfolioSummary(id);
  if (!perf) return null;

  const roiColor =
    perf.returnRatePct != null
      ? perf.returnRatePct >= 0
        ? "text-green-400"
        : "text-red-400"
      : undefined;

  const uPnlColor =
    port?.unrealizedPnl != null
      ? port.unrealizedPnl >= 0
        ? "text-green-400"
        : "text-red-400"
      : undefined;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
      <h3 className="text-lg font-semibold text-white mb-4">Overview</h3>

      {/* Config row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <Stat label="Strategy" value={perf.strategyType || "-"} />
        <Stat label="Initial Capital" value={formatCurrency(perf.initialCapital)} />
        <Stat label="ROI" value={formatPct(perf.returnRatePct)} color={roiColor} />
        <Stat label="Exchange" value={perf.exchangeId || "-"} />
        <Stat label="Provider" value={perf.llmProvider || "-"} />
        <Stat label="Model" value={perf.llmModelId || "-"} />
        <Stat label="Mode" value={perf.tradingMode || "-"} />
        <Stat label="Max Leverage" value={perf.maxLeverage ? `${perf.maxLeverage}x` : "-"} />
      </div>

      {perf.symbols && perf.symbols.length > 0 && (
        <div className="mb-4">
          <span className="text-sm text-gray-500">Symbols: </span>
          <span className="text-sm text-gray-300">{perf.symbols.join(", ")}</span>
        </div>
      )}

      {/* Live portfolio row — only shown when data is available */}
      {port && (
        <>
          <div className="border-t border-gray-800 my-3" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="Total Value" value={formatCurrency(port.totalValue)} />
            <Stat label="Available Cash" value={formatCurrency(port.cash)} />
            <Stat
              label="Unrealized PnL"
              value={formatCurrency(port.unrealizedPnl)}
              color={uPnlColor}
            />
            <Stat
              label="Unrealized PnL %"
              value={formatPct(port.unrealizedPnlPct)}
              color={uPnlColor}
            />
          </div>
        </>
      )}
    </div>
  );
}

// ----- Prompt -----

function PromptSectionWrapper({ id }: { id: string }) {
  const { data } = useStrategyPerformance(id);
  return <PromptSection id={id} currentPrompt={data?.prompt ?? null} />;
}

function BacktestSectionWrapper({ id }: { id: string }) {
  const { data } = useStrategyPerformance(id);
  return <BacktestSection id={id} currentPrompt={data?.prompt ?? null} />;
}

// ----- Holdings -----

function HoldingsSection({ id }: { id: string }) {
  const { data: holdings } = useStrategyHoldings(id);
  const closeMutation = useClosePosition();
  const [closingSymbol, setClosingSymbol] = useState<string | null>(null);

  if (!holdings || holdings.length === 0) return null;

  const handleClose = (symbol: string) => {
    if (!window.confirm(`Close ${symbol} position at market price?`)) return;
    setClosingSymbol(symbol);
    closeMutation.mutate(
      { id, symbol },
      { onSettled: () => setClosingSymbol(null) }
    );
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
      <h3 className="text-lg font-semibold text-white mb-4">Open Positions</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 border-b border-gray-800">
              <th className="text-left py-2 font-medium">Symbol</th>
              <th className="text-left py-2 font-medium">Side</th>
              <th className="text-right py-2 font-medium">Qty</th>
              <th className="text-right py-2 font-medium">Entry Price</th>
              <th className="text-right py-2 font-medium">Leverage</th>
              <th className="text-right py-2 font-medium">Unrealized PnL</th>
              <th className="text-right py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((h) => (
              <tr key={h.symbol} className="border-b border-gray-800/50">
                <td className="py-2.5 text-white font-medium">{h.symbol}</td>
                <td className="py-2.5">
                  <span
                    className={cn(
                      "text-xs px-1.5 py-0.5 rounded",
                      h.type === "LONG"
                        ? "bg-green-500/10 text-green-400"
                        : "bg-red-500/10 text-red-400"
                    )}
                  >
                    {h.type}
                  </span>
                </td>
                <td className="py-2.5 text-right text-gray-300">
                  {formatNumber(h.quantity)}
                </td>
                <td className="py-2.5 text-right text-gray-300">
                  {formatCurrency(h.entryPrice)}
                </td>
                <td className="py-2.5 text-right text-gray-300">
                  {h.leverage ? `${h.leverage}x` : "-"}
                </td>
                <td
                  className={cn(
                    "py-2.5 text-right",
                    h.unrealizedPnl != null && h.unrealizedPnl >= 0
                      ? "text-green-400"
                      : "text-red-400"
                  )}
                >
                  {formatCurrency(h.unrealizedPnl)}
                  {h.unrealizedPnlPct != null && (
                    <span className="text-xs ml-1">
                      ({formatPct(h.unrealizedPnlPct)})
                    </span>
                  )}
                </td>
                <td className="py-2.5 text-right">
                  <button
                    onClick={() => handleClose(h.symbol)}
                    disabled={closingSymbol === h.symbol}
                    className="text-xs px-2.5 py-1 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {closingSymbol === h.symbol ? "Closing…" : "Close"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ----- Trade History -----

function TradeHistorySection({ id }: { id: string }) {
  const { data: cycles } = useStrategyDetail(id);
  if (!cycles || cycles.length === 0) return null;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
      <h3 className="text-lg font-semibold text-white mb-4">Trade History</h3>
      <div className="space-y-4">
        {cycles.map((cycle) => (
          <div key={cycle.composeId} className="border border-gray-800 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-400">
                Cycle #{cycle.cycleIndex}
              </span>
              <span className="text-xs text-gray-500">
                {new Date(cycle.createdAt).toLocaleString()}
              </span>
            </div>
            {cycle.rationale && (
              <p className="text-sm text-gray-400 mb-3 italic">
                {cycle.rationale}
              </p>
            )}
            {cycle.actions.length > 0 && (
              <div className="space-y-1">
                {cycle.actions.map((a) => (
                  <div
                    key={a.instructionId}
                    className="flex items-center justify-between text-sm py-1"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "text-xs px-1.5 py-0.5 rounded font-mono",
                          a.action.includes("open")
                            ? "bg-blue-500/10 text-blue-400"
                            : "bg-orange-500/10 text-orange-400"
                        )}
                      >
                        {a.action.replace("_", " ").toUpperCase()}
                      </span>
                      <span className="text-white">{a.symbol}</span>
                      {a.quantity && (
                        <span className="text-gray-500">
                          qty={formatNumber(a.quantity)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4">
                      {a.avgExecPrice && (
                        <span className="text-gray-400">
                          @{formatNumber(a.avgExecPrice, 2)}
                        </span>
                      )}
                      {a.realizedPnl != null && a.realizedPnl !== 0 && (
                        <span
                          className={cn(
                            "font-medium",
                            a.realizedPnl >= 0 ? "text-green-400" : "text-red-400"
                          )}
                        >
                          {formatCurrency(a.realizedPnl)}
                          {a.realizedPnlPct != null && (
                            <span className="text-xs ml-1 opacity-75">
                              ({formatPct(a.realizedPnlPct)})
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ----- AI Chat -----

interface Message {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

const QUICK_PROMPTS = [
  "Why did you make these recent trades?",
  "Analyze the current risk exposure.",
  "How can I improve this strategy?",
  "Summarize the performance so far.",
];

// ChatSection renders as a fixed bottom bar (right of the w-64 sidebar).
// Clicking the input or a quick prompt expands it to show conversation history.
// Clicking outside collapses it back to the compact input strip.
function ChatSection({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Collapse when user clicks outside the panel
  useEffect(() => {
    if (!open) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [open]);

  // Auto-scroll to newest message
  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  // Focus the input when the panel opens
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => textareaRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isStreaming) return;
      setInput("");
      setOpen(true);

      const history = messages
        .filter((m) => !m.streaming)
        .map((m) => ({ role: m.role, content: m.content }));

      setMessages((prev) => [
        ...prev,
        { role: "user", content: trimmed },
        { role: "assistant", content: "", streaming: true },
      ]);
      setIsStreaming(true);

      const abort = new AbortController();
      abortRef.current = abort;

      try {
        const res = await fetch("/api/v1/strategies/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, message: trimmed, history }),
          signal: abort.signal,
        });

        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const payload = line.slice(6);
            if (payload === "[DONE]") break;

            try {
              const parsed: unknown = JSON.parse(payload);
              // Server sends json.Marshal(string) → a JSON string e.g. "hello"
              // On error it sends {"error":"..."} → surface as a warning line
              let chunk: string;
              if (typeof parsed === "string") {
                chunk = parsed;
              } else if (parsed && typeof parsed === "object" && "error" in parsed) {
                chunk = `⚠ ${(parsed as { error: string }).error}`;
              } else {
                continue;
              }
              setMessages((prev) => {
                const copy = [...prev];
                const last = copy[copy.length - 1];
                if (last?.streaming) {
                  copy[copy.length - 1] = { ...last, content: last.content + chunk };
                }
                return copy;
              });
            } catch {
              // ignore unparseable lines
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setMessages((prev) => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            if (last?.streaming) {
              copy[copy.length - 1] = {
                ...last,
                content: last.content || "Error: " + (err as Error).message,
                streaming: false,
              };
            }
            return copy;
          });
        }
      } finally {
        setMessages((prev) =>
          prev.map((m) => (m.streaming ? { ...m, streaming: false } : m))
        );
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [id, messages, isStreaming]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  return (
    <>
      {/* Fixed bottom bar — sits to the right of the w-64 sidebar */}
      <div
        ref={panelRef}
        className="fixed bottom-0 left-64 right-0 z-40 bg-gray-950 border-t border-gray-800 shadow-2xl"
      >
        {/* Expanded area: conversation history (only when open) */}
        {open && (
          <div className="border-b border-gray-800">
            {/* Header */}
            <div className="max-w-7xl mx-auto px-6 py-2.5 flex items-center justify-between">
              <span className="text-sm font-semibold text-white">Ask AI</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-gray-500 hover:text-gray-300 text-xl leading-none transition-colors"
                aria-label="Close chat"
              >
                ×
              </button>
            </div>

            {/* Messages or quick-prompt chips */}
            <div className="max-w-7xl mx-auto px-6 pb-4 max-h-[50vh] overflow-y-auto">
              {messages.length === 0 ? (
                <div className="flex flex-wrap gap-2">
                  {QUICK_PROMPTS.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => send(q)}
                      disabled={isStreaming}
                      className="text-xs px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 hover:border-blue-500 hover:text-blue-300 transition-colors disabled:opacity-40"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {messages.map((m, i) => (
                    <div
                      key={i}
                      className={cn(
                        "flex",
                        m.role === "user" ? "justify-end" : "justify-start"
                      )}
                    >
                      <div
                        className={cn(
                          "max-w-[80%] rounded-xl px-4 py-2.5 text-sm whitespace-pre-wrap",
                          m.role === "user"
                            ? "bg-blue-600 text-white"
                            : "bg-gray-800 text-gray-200 border border-gray-700"
                        )}
                      >
                        {m.content}
                        {m.streaming && (
                          <span className="inline-flex gap-0.5 ml-1">
                            <span className="animate-bounce" style={{ animationDelay: "0ms" }}>·</span>
                            <span className="animate-bounce" style={{ animationDelay: "150ms" }}>·</span>
                            <span className="animate-bounce" style={{ animationDelay: "300ms" }}>·</span>
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  <div ref={bottomRef} />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Input strip — always visible */}
        <div className="max-w-7xl mx-auto px-6 py-3 flex gap-2 items-center">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            disabled={isStreaming}
            placeholder="Ask AI about your strategy…  (Enter to send · Shift+Enter for newline)"
            rows={1}
            className="flex-1 bg-gray-900 border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-blue-500 resize-none disabled:opacity-50 placeholder-gray-600"
          />
          {isStreaming ? (
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              className="px-4 py-2 rounded-lg bg-red-600/20 text-red-400 hover:bg-red-600/30 text-sm font-medium transition-colors whitespace-nowrap"
            >
              Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={() => send(input)}
              disabled={!input.trim()}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium transition-colors"
            >
              Send
            </button>
          )}
        </div>
      </div>

      {/* Spacer keeps the last page section from being obscured by the fixed bar */}
      <div className="h-16" />
    </>
  );
}

// ----- Shared -----

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div>
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={cn("text-sm font-medium", color || "text-gray-200")}>
        {value}
      </div>
    </div>
  );
}
