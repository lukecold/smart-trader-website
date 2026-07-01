import { useState } from "react";

export interface CopyTradePayload {
  allocation: number;
  mode: "paper" | "live";
  onConstraint: "skip" | "partial";
  apiKey?: string;
  apiSecret?: string;
}

// Shared copy-trade dialog used from the leaderboard and the redacted view. It
// collects the allocation, paper/live mode, the constraint behaviour, and — only
// for live — the follower's Binance API key/secret (which the backend seals into
// an encrypted vault; they are never stored in plaintext or echoed back).
export function CopyTradeModal({
  name,
  onCancel,
  onConfirm,
}: {
  name: string;
  onCancel: () => void;
  onConfirm: (p: CopyTradePayload) => void;
}) {
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<"paper" | "live">("paper");
  const [onConstraint, setOnConstraint] = useState<"skip" | "partial">("skip");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");

  const allocation = Number(amount);
  const amountValid = amount.trim() !== "" && Number.isFinite(allocation) && allocation > 0;
  const liveValid = mode === "paper" || (apiKey.trim() !== "" && apiSecret.trim() !== "");
  const valid = amountValid && liveValid;
  const lowCapital = amountValid && allocation < 500;

  function submit() {
    if (!valid) return;
    onConfirm({
      allocation,
      mode,
      onConstraint,
      apiKey: mode === "live" ? apiKey.trim() : undefined,
      apiSecret: mode === "live" ? apiSecret.trim() : undefined,
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div
        className="bg-gray-900 border border-gray-800 rounded-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-white mb-1">Copy-trade strategy</h3>
        <p className="text-sm text-gray-400 mb-4 truncate">{name}</p>

        {/* Allocation */}
        <label className="block text-xs text-gray-500 mb-1">Amount to allocate (USD)</label>
        <input
          type="number"
          autoFocus
          min={0}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="1000"
          className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-blue-500"
        />
        {lowCapital && (
          <p className="mt-1.5 text-xs text-amber-400/90">
            ⚠ Allocations under ~$500 may fail to mirror some trades (Binance minimum
            order size). Small trades will be skipped and surfaced in your copy-trade status.
          </p>
        )}

        {/* Mode */}
        <div className="mt-4">
          <label className="block text-xs text-gray-500 mb-1">Mode</label>
          <div className="flex rounded-lg bg-gray-800/80 p-0.5 gap-0.5">
            {(["paper", "live"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={
                  "flex-1 px-3 py-1.5 rounded text-xs font-medium transition-colors " +
                  (mode === m ? "bg-gray-600 text-white" : "text-gray-400 hover:text-gray-200")
                }
              >
                {m === "paper" ? "Paper (simulated)" : "Live (real orders)"}
              </button>
            ))}
          </div>
        </div>

        {/* Constraint behaviour */}
        <div className="mt-4">
          <label className="block text-xs text-gray-500 mb-1">
            When a trade is too small / exceeds your allocation
          </label>
          <div className="flex rounded-lg bg-gray-800/80 p-0.5 gap-0.5">
            {(["skip", "partial"] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setOnConstraint(c)}
                className={
                  "flex-1 px-3 py-1.5 rounded text-xs font-medium transition-colors " +
                  (onConstraint === c ? "bg-gray-600 text-white" : "text-gray-400 hover:text-gray-200")
                }
              >
                {c === "skip" ? "Skip it (safe)" : "Try partial"}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-gray-600">
            {onConstraint === "skip"
              ? "Skips mirrors that violate limits and tells you why."
              : "Attempts the trade anyway — it may be rejected by the exchange."}
          </p>
        </div>

        {/* Live credentials */}
        {mode === "live" && (
          <div className="mt-4 space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
            <p className="text-xs text-amber-300/90">
              Live copy-trading places <span className="font-semibold">real orders</span> in
              your own Binance USD-M futures account. Use a{" "}
              <span className="font-semibold">trade-only API key with withdrawals DISABLED</span>.
              Your key is encrypted at rest and never shown again.
            </p>
            <input
              type="text"
              autoComplete="off"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Binance API key"
              className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-white text-xs outline-none focus:border-blue-500"
            />
            <input
              type="password"
              autoComplete="off"
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
              placeholder="Binance API secret"
              className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-white text-xs outline-none focus:border-blue-500"
            />
            <p className="text-xs text-gray-600">
              If live copy-trading is disabled on the server, this is recorded in paper mode.
            </p>
          </div>
        )}

        {mode === "paper" && (
          <p className="mt-3 text-xs text-gray-500">
            Paper mode tracks this strategy's trades against your allocation without placing
            any real orders.
          </p>
        )}

        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onCancel}
            className="text-xs px-4 py-2 rounded-lg text-gray-400 hover:text-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!valid}
            className="text-xs px-4 py-2 rounded-lg bg-amber-600 text-white hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {mode === "live" ? "Start live copy-trade" : "Start paper copy-trade"}
          </button>
        </div>
      </div>
    </div>
  );
}
