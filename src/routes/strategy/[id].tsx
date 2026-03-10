import { useParams, Link } from "react-router-dom";
import {
  useStrategyPerformance,
  useStrategyHoldings,
  usePortfolioSummary,
  useStrategyDetail,
} from "@/api/strategies";
import { formatCurrency, formatPct, formatNumber, cn } from "@/lib/utils";

export function StrategyDetail() {
  const { id } = useParams<{ id: string }>();
  if (!id) return null;

  return (
    <div className="space-y-6">
      <Link to="/" className="text-sm text-gray-500 hover:text-gray-300">
        &larr; Back to Dashboard
      </Link>
      <PerformanceSection id={id} />
      <PortfolioSection id={id} />
      <HoldingsSection id={id} />
      <TradeHistorySection id={id} />
    </div>
  );
}

function PerformanceSection({ id }: { id: string }) {
  const { data } = useStrategyPerformance(id);
  if (!data) return null;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
      <h3 className="text-lg font-semibold text-white mb-4">Performance</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Strategy" value={data.strategyType || "-"} />
        <Stat label="Initial Capital" value={formatCurrency(data.initialCapital)} />
        <Stat
          label="ROI"
          value={formatPct(data.returnRatePct)}
          color={
            data.returnRatePct != null
              ? data.returnRatePct >= 0
                ? "text-green-400"
                : "text-red-400"
              : undefined
          }
        />
        <Stat label="Exchange" value={data.exchangeId || "-"} />
        <Stat label="Provider" value={data.llmProvider || "-"} />
        <Stat label="Model" value={data.llmModelId || "-"} />
        <Stat label="Mode" value={data.tradingMode || "-"} />
        <Stat label="Max Leverage" value={data.maxLeverage ? `${data.maxLeverage}x` : "-"} />
      </div>
      {data.symbols && data.symbols.length > 0 && (
        <div className="mt-4">
          <span className="text-sm text-gray-500">Symbols: </span>
          <span className="text-sm text-gray-300">{data.symbols.join(", ")}</span>
        </div>
      )}
    </div>
  );
}

function PortfolioSection({ id }: { id: string }) {
  const { data } = usePortfolioSummary(id);
  if (!data) return null;

  const pnlColor =
    data.totalPnl != null
      ? data.totalPnl >= 0
        ? "text-green-400"
        : "text-red-400"
      : undefined;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
      <h3 className="text-lg font-semibold text-white mb-4">Portfolio</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Cash" value={formatCurrency(data.cash)} />
        <Stat label="Total Value" value={formatCurrency(data.totalValue)} />
        <Stat label="Total PnL" value={formatCurrency(data.totalPnl)} color={pnlColor} />
        <Stat label="PnL %" value={formatPct(data.totalPnlPct)} color={pnlColor} />
        <Stat label="Gross Exposure" value={formatCurrency(data.grossExposure)} />
        <Stat label="Net Exposure" value={formatCurrency(data.netExposure)} />
      </div>
    </div>
  );
}

function HoldingsSection({ id }: { id: string }) {
  const { data: holdings } = useStrategyHoldings(id);
  if (!holdings || holdings.length === 0) return null;

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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

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
                            a.realizedPnl >= 0 ? "text-green-400" : "text-red-400"
                          )}
                        >
                          {formatCurrency(a.realizedPnl)}
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
