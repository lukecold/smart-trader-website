import { useState } from "react";
import {
  useBinanceOnboardingInfo,
  useValidateBinanceCredentials,
  type BinanceApiRestrictions,
} from "@/api/strategies";

type Step = "account" | "createKey" | "verify";

// Guided Binance API-key setup, launched from the strategy-create form when
// Binance is the selected broker. Walks the user from "no Binance account"
// through key creation (with the server IP to whitelist, copyable) to a live
// server-side verification of the pasted key. Validation runs from the
// trading server itself, so a pass also proves the key's IP whitelist admits
// the IP that will actually place orders.
export function BinanceOnboardingWizard({
  marketType,
  onCancel,
  onComplete,
}: {
  marketType: string; // "swap" | "spot"
  onCancel: () => void;
  onComplete: (creds: { apiKey: string; secretKey: string }) => void;
}) {
  const [step, setStep] = useState<Step>("account");
  const [apiKey, setApiKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [restrictions, setRestrictions] = useState<BinanceApiRestrictions | null>(null);
  const [validateError, setValidateError] = useState("");
  const [ipCopied, setIpCopied] = useState(false);

  const info = useBinanceOnboardingInfo();
  const validate = useValidateBinanceCredentials();

  const whitelistIp = info.data?.whitelistIp ?? "";
  const registerUrl = info.data?.registerUrl ?? "https://accounts.binance.com/register";
  const apiManagementUrl =
    info.data?.apiManagementUrl ?? "https://www.binance.com/en/my/settings/api-management";

  const copyIp = async () => {
    try {
      await navigator.clipboard.writeText(whitelistIp);
      setIpCopied(true);
      setTimeout(() => setIpCopied(false), 2000);
    } catch {
      // Clipboard can be unavailable (http, permissions); the IP stays visible to copy by hand.
    }
  };

  const runValidate = () => {
    setValidateError("");
    setRestrictions(null);
    validate.mutate(
      { exchange_id: "binance", api_key: apiKey.trim(), secret_key: secretKey.trim() },
      {
        onSuccess: (data) => setRestrictions(data),
        onError: (e) => setValidateError(e instanceof Error ? e.message : "Validation failed"),
      }
    );
  };

  // Which trade permission the chosen market type actually needs.
  const needsFutures = marketType !== "spot";
  const tradingOk = restrictions
    ? needsFutures
      ? restrictions.enableFutures
      : restrictions.enableSpotAndMarginTrading
    : false;
  // Withdrawals must be OFF: the strategy only trades, and a leaked trade-only
  // key can't drain the account. IP restriction is recommended, not required —
  // the checklist warns but doesn't block.
  const canUse =
    restrictions !== null && restrictions.enableReading && tradingOk && !restrictions.enableWithdrawals;

  const stepIndex = { account: 1, createKey: 2, verify: 3 }[step];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div
        className="bg-gray-900 border border-gray-800 rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-white mb-1">Binance API key setup</h3>
        <p className="text-xs text-gray-500 mb-4">Step {stepIndex} of 3</p>

        {step === "account" && (
          <div className="space-y-4">
            <p className="text-sm text-gray-300">Do you already have a Binance account?</p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setStep("createKey")}
                className="text-sm px-4 py-2.5 rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors text-left"
              >
                Yes — continue to API key setup
              </button>
              <a
                href={registerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm px-4 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-200 hover:bg-gray-700 transition-colors"
              >
                No — create a Binance account ↗
              </a>
              <p className="text-xs text-gray-500">
                Registration takes a few minutes (email + identity verification). Leave this
                wizard open — once your account is ready, come back and continue.
              </p>
              <button
                type="button"
                onClick={() => setStep("createKey")}
                className="text-xs text-blue-400 hover:text-blue-300 text-left"
              >
                My account is ready — continue →
              </button>
            </div>
          </div>
        )}

        {step === "createKey" && (
          <div className="space-y-4">
            <ol className="text-sm text-gray-300 space-y-2.5 list-decimal list-inside">
              <li>
                Open{" "}
                <a
                  href={apiManagementUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300"
                >
                  Binance API Management ↗
                </a>{" "}
                and click <span className="text-white">Create API</span> → System generated.
              </li>
              <li>
                Name it (e.g. <span className="text-white">smart-trader</span>) and complete
                the security verification.
              </li>
              <li>
                Click <span className="text-white">Edit restrictions</span>, then enable{" "}
                <span className="text-white">
                  {needsFutures ? "Futures" : "Spot & Margin Trading"}
                </span>
                . Leave <span className="text-white">Withdrawals disabled</span>.
              </li>
              <li>
                Select{" "}
                <span className="text-white">Restrict access to trusted IPs only</span> and add
                this server's IP:
              </li>
            </ol>

            {whitelistIp ? (
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-emerald-300 select-all">
                  {whitelistIp}
                </code>
                <button
                  type="button"
                  onClick={copyIp}
                  className="text-sm px-3 py-2 rounded-lg bg-gray-700 text-gray-200 hover:bg-gray-600 transition-colors whitespace-nowrap"
                >
                  {ipCopied ? "✓ Copied" : "Copy IP"}
                </button>
              </div>
            ) : (
              <p className="text-xs text-amber-400">
                {info.isLoading
                  ? "Fetching the server IP…"
                  : "Couldn't determine the server IP automatically — ask the operator for the IP to whitelist."}
              </p>
            )}

            <p className="text-xs text-gray-500">
              IP restriction means the key only works from this trading server — even someone
              who steals the key can't use it from anywhere else.
            </p>

            <div className="flex justify-between pt-2">
              <button
                type="button"
                onClick={() => setStep("account")}
                className="text-sm px-4 py-2 rounded-lg text-gray-400 hover:text-gray-200 transition-colors"
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={() => setStep("verify")}
                className="text-sm px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors"
              >
                I created the key — verify it →
              </button>
            </div>
          </div>
        )}

        {step === "verify" && (
          <div className="space-y-4">
            <p className="text-sm text-gray-300">
              Paste the key pair Binance showed you (the secret is only displayed once).
            </p>
            <div>
              <label className="block text-xs text-gray-500 mb-1">API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setRestrictions(null);
                }}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Secret Key</label>
              <input
                type="password"
                value={secretKey}
                onChange={(e) => {
                  setSecretKey(e.target.value);
                  setRestrictions(null);
                }}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-blue-500"
              />
            </div>

            <button
              type="button"
              onClick={runValidate}
              disabled={!apiKey.trim() || !secretKey.trim() || validate.isPending}
              className="text-sm px-4 py-2 rounded-lg bg-gray-700 text-gray-200 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {validate.isPending ? "Verifying with Binance…" : "Verify key"}
            </button>

            {validateError && <p className="text-xs text-red-400">{validateError}</p>}

            {restrictions && (
              <ul className="text-sm space-y-1.5 bg-gray-800/60 border border-gray-700 rounded-lg p-3">
                <CheckRow ok={restrictions.enableReading} label="Key is valid and readable" />
                <CheckRow
                  ok={tradingOk}
                  label={
                    needsFutures
                      ? "Futures trading enabled"
                      : "Spot & margin trading enabled"
                  }
                  fix={`Edit the key on Binance and enable ${
                    needsFutures ? "Futures" : "Spot & Margin Trading"
                  }.`}
                />
                <CheckRow
                  ok={!restrictions.enableWithdrawals}
                  label="Withdrawals disabled"
                  fix="Disable withdrawals on the key — the strategy only needs to trade."
                />
                {restrictions.ipRestrict ? (
                  <CheckRow ok label="IP restriction on (whitelist verified from this server)" />
                ) : (
                  <li className="flex gap-2 text-amber-400">
                    <span>⚠</span>
                    <span>
                      No IP restriction — the key works from anywhere. Strongly consider
                      restricting it{whitelistIp ? ` to ${whitelistIp}` : ""}.
                    </span>
                  </li>
                )}
              </ul>
            )}

            <div className="flex justify-between pt-2">
              <button
                type="button"
                onClick={() => setStep("createKey")}
                className="text-sm px-4 py-2 rounded-lg text-gray-400 hover:text-gray-200 transition-colors"
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={() => onComplete({ apiKey: apiKey.trim(), secretKey: secretKey.trim() })}
                disabled={!canUse}
                className="text-sm px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Use this key
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CheckRow({ ok, label, fix }: { ok: boolean; label: string; fix?: string }) {
  return (
    <li className={`flex gap-2 ${ok ? "text-emerald-400" : "text-red-400"}`}>
      <span>{ok ? "✓" : "✗"}</span>
      <span>
        {label}
        {!ok && fix && <span className="block text-xs text-gray-400">{fix}</span>}
      </span>
    </li>
  );
}
