import { useEffect, useRef, useState } from "react";
import { useInstrumentSearch } from "@/api/strategies";
import type { InstrumentMatch } from "@/api/strategies";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import type { AssetClass } from "@/lib/brokers";

// invalidSymbolReason returns the guard message for a ticker the SELECTED broker
// cannot trade, or null when it passes. Shared by the tag input's add guard and
// by forms that re-validate an existing list after a broker switch (replicate).
export function invalidSymbolReason(
  sym: string,
  assetClass: AssetClass,
  exchangeId: string
): string | null {
  const s = sym.trim().toUpperCase().replace(/\s/g, "");
  if (!s) return null;
  // Asset-class guard: equity brokers take plain tickers (AAPL), not crypto pairs
  // (BTC-USDT). Block the obvious mismatch so it never reaches the backend.
  if (assetClass === "equity" && /[-/:]/.test(s)) {
    return `"${s}" looks like a crypto pair — equity brokers use plain tickers (e.g. AAPL).`;
  }
  // Non-US tickers carry an exchange suffix (1211.HK, 8058.TSEJ, 005930.KR, HSBA.L, ...);
  // only IBKR routes non-US markets — Alpaca/TradeStation/Schwab are US-only.
  if (assetClass === "equity" && /\.(HK|TSEJ|KR|L|DE|TO|AU|SG)$/.test(s) && exchangeId !== "ibkr") {
    return `"${s}" is a non-US market ticker — only IBKR can trade those.`;
  }
  return null;
}

// SymbolTagInput is the shared ticker editor: popular presets, a tag input with
// debounced search of the SELECTED broker's universe (dropdown with pending /
// unavailable / no-matches states and full keyboard nav), and the asset-class
// guards. Used by the create form and the replicate modal. Behavior mirrors the
// original create-form implementation exactly.
export function SymbolTagInput({
  symbols,
  onChange,
  exchangeId,
  assetClass,
  marketType,
  popularSymbols,
  tagBoxClassName,
}: {
  symbols: string[];
  onChange: (symbols: string[]) => void;
  exchangeId: string;
  assetClass: AssetClass;
  // Binance market type for crypto search ("swap" | "spot"); ignored for equities.
  marketType: string;
  popularSymbols: string[];
  // Optional override for the tag box container (the replicate modal matches its
  // own darker input styling).
  tagBoxClassName?: string;
}) {
  const [symbolInput, setSymbolInput] = useState("");
  const [symbolError, setSymbolError] = useState("");
  const symbolInputRef = useRef<HTMLInputElement>(null);

  // Ticker search for every broker: equities (incl. the non-US venues) for equity
  // brokers, Binance tradable pairs for crypto. Debounced so a request fires per
  // pause, not per keystroke; the dropdown state is derived from this query.
  const [symbolFocused, setSymbolFocused] = useState(false);
  const [symbolHighlight, setSymbolHighlight] = useState(-1);
  const [symbolDismissed, setSymbolDismissed] = useState(""); // query the user Escaped away
  const trimmedSymbolQuery = symbolInput.trim();
  const debouncedSymbolQuery = useDebouncedValue(trimmedSymbolQuery, 300);
  const {
    data: symbolSearch,
    isFetching: symbolSearching,
    isError: symbolSearchFailed,
  } = useInstrumentSearch(
    debouncedSymbolQuery,
    assetClass,
    assetClass === "crypto" ? marketType : "swap",
    exchangeId
  );

  // US-only brokers (Alpaca/TradeStation/Schwab) hide non-US matches; crypto
  // matches carry no suffix and always pass. addSymbol's guard stays as backstop.
  const symbolMatches = (symbolSearch?.matches ?? []).filter(
    (m) => exchangeId === "ibkr" || !m.suffix
  );
  // A failed/unavailable search still opens the dropdown (one muted notice row)
  // so the user can tell search exists but is down; the typed symbol still
  // commits with Enter, and keyboard nav is inert with an empty match list.
  const symbolSearchUnavailable = symbolSearchFailed || !!symbolSearch?.unavailable;
  const symbolDropdownOpen =
    symbolFocused &&
    trimmedSymbolQuery.length >= 2 &&
    trimmedSymbolQuery !== symbolDismissed;
  const symbolSearchPending =
    symbolSearching || trimmedSymbolQuery !== debouncedSymbolQuery;

  // A fresh match list resets the keyboard highlight.
  useEffect(() => {
    setSymbolHighlight(-1);
  }, [symbolSearch?.matches]);

  // A broker switch invalidates any pending query/error (the form re-validates
  // the committed tags itself).
  useEffect(() => {
    setSymbolInput("");
    setSymbolError("");
    setSymbolDismissed("");
  }, [exchangeId, assetClass]);

  const addSymbol = (sym: string) => {
    const s = sym.trim().toUpperCase().replace(/\s/g, "");
    if (!s) {
      setSymbolInput("");
      return;
    }
    const reason = invalidSymbolReason(s, assetClass, exchangeId);
    if (reason) {
      setSymbolError(reason);
      return;
    }
    setSymbolError("");
    if (!symbols.includes(s)) {
      onChange([...symbols, s]);
    }
    setSymbolInput("");
  };

  const removeSymbol = (sym: string) =>
    onChange(symbols.filter((s) => s !== sym));

  const togglePopularSymbol = (sym: string) => {
    if (symbols.includes(sym)) {
      removeSymbol(sym);
    } else {
      onChange([...symbols, sym]);
    }
  };

  // Pick a search match: commit its display form (symbol+suffix) and keep focus
  // for the next symbol.
  const pickSymbolMatch = (m: InstrumentMatch) => {
    addSymbol(m.display);
    setSymbolInput("");
    setSymbolHighlight(-1);
    symbolInputRef.current?.focus();
  };

  const handleSymbolKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (symbolDropdownOpen && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      setSymbolHighlight((h) => {
        const next = e.key === "ArrowDown" ? h + 1 : h - 1;
        return Math.max(-1, Math.min(next, symbolMatches.length - 1));
      });
      return;
    }
    if (e.key === "Escape" && symbolDropdownOpen) {
      e.preventDefault();
      setSymbolDismissed(trimmedSymbolQuery); // close without committing; typing more reopens
      return;
    }
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      if (e.key === "Enter" && symbolDropdownOpen && symbolHighlight >= 0 && symbolMatches[symbolHighlight]) {
        pickSymbolMatch(symbolMatches[symbolHighlight]);
      } else {
        addSymbol(symbolInput);
      }
    } else if (e.key === "Backspace" && symbolInput === "" && symbols.length > 0) {
      onChange(symbols.slice(0, -1));
    }
  };

  return (
    <div>
      {/* Popular presets */}
      <div className="flex flex-wrap gap-1.5 mb-2">
        {popularSymbols.map((sym) => (
          <button
            key={sym}
            type="button"
            onClick={() => togglePopularSymbol(sym)}
            className={`text-xs px-2 py-1 rounded-full border transition-colors ${
              symbols.includes(sym)
                ? "border-blue-500 bg-blue-500/20 text-blue-300"
                : "border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-500"
            }`}
          >
            {sym}
          </button>
        ))}
      </div>
      {/* Tag input + ticker-search dropdown (all brokers) */}
      <div className="relative">
        <div
          className={
            tagBoxClassName ??
            "min-h-[42px] bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 flex flex-wrap gap-1.5 items-center cursor-text focus-within:border-blue-500 transition-colors"
          }
          onClick={() => symbolInputRef.current?.focus()}
        >
          {symbols.map((sym) => (
            <span
              key={sym}
              className="flex items-center gap-1 bg-blue-500/20 text-blue-300 text-xs px-2 py-0.5 rounded-full"
            >
              {sym}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); removeSymbol(sym); }}
                className="hover:text-white leading-none"
              >
                ×
              </button>
            </span>
          ))}
          <input
            ref={symbolInputRef}
            value={symbolInput}
            onChange={(e) => setSymbolInput(e.target.value)}
            onKeyDown={handleSymbolKeyDown}
            onFocus={() => setSymbolFocused(true)}
            onBlur={() => {
              setSymbolFocused(false);
              // An open dropdown means the text is an unconfirmed search
              // query — don't auto-commit it (a row pick uses onMouseDown
              // to beat this blur and commits itself).
              if (!symbolDropdownOpen && symbolInput.trim()) addSymbol(symbolInput);
            }}
            placeholder={symbols.length === 0 ? "Type symbol + Enter…" : ""}
            className="bg-transparent outline-none text-white text-sm flex-1 min-w-[120px] placeholder-gray-600"
          />
        </div>
        {symbolDropdownOpen && (
          <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-lg border border-gray-700 bg-gray-900 shadow-xl">
            {symbolSearchUnavailable ? (
              <div className="px-3 py-2 text-xs text-gray-500">
                Ticker search unavailable — type the full symbol and press Enter
              </div>
            ) : symbolSearchPending ? (
              <div className="px-3 py-2 text-xs text-gray-500">Searching…</div>
            ) : symbolMatches.length === 0 ? (
              <div className="px-3 py-2 text-xs text-gray-500">No matches</div>
            ) : (
              symbolMatches.map((m, i) => (
                <button
                  key={`${m.exchange}:${m.display}`}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault(); // beat the input's blur
                    e.stopPropagation();
                    pickSymbolMatch(m);
                  }}
                  onMouseEnter={() => setSymbolHighlight(i)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                    i === symbolHighlight ? "bg-gray-800" : "hover:bg-gray-800/60"
                  }`}
                >
                  <span className="font-semibold text-white">{m.display}</span>
                  <span className="truncate text-gray-400">{m.name}</span>
                  <span className="ml-auto shrink-0 rounded bg-gray-700 px-1.5 py-0.5 text-[10px] uppercase text-gray-500">
                    {m.exchange}
                    {m.currency ? ` · ${m.currency}` : ""}
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
      <p className="text-xs text-gray-600 mt-1">Click presets or type and press Enter / comma</p>
      {symbolError && <p className="text-xs text-red-400 mt-1">{symbolError}</p>}
    </div>
  );
}
