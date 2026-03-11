import { useState, useRef, useCallback, useEffect } from "react";
import { diffLines, type Change } from "diff";
import { cn } from "@/lib/utils";
import { usePromptHistory, useUpdatePrompt } from "@/api/strategies";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useAuthStore } from "@/stores/auth";

type Mode = "view" | "edit" | "improve" | "history";
type DiffViewMode = "inline" | "split";

interface ImproveMsg {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

interface Props {
  id: string;
  currentPrompt: string | null;
}

export function PromptSection({ id, currentPrompt }: Props) {
  const [collapsed, setCollapsed] = useState(true);
  const [mode, setMode] = useState<Mode>("view");

  // Edit state
  const [editText, setEditText] = useState("");
  const [editNote, setEditNote] = useState("");

  // Improve with AI state
  const [improveMessages, setImproveMessages] = useState<ImproveMsg[]>([]);
  const [improveInput, setImproveInput] = useState("");
  const [isImproving, setIsImproving] = useState(false);
  const [proposedPrompt, setProposedPrompt] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // History / diff state
  const [selectedVersions, setSelectedVersions] = useState<number[]>([]);
  const [diffMode, setDiffMode] = useState<DiffViewMode>("inline");

  const { data: versions } = usePromptHistory(id);
  const updatePrompt = useUpdatePrompt();
  const { withAuth } = useAuthGuard();

  // Scroll chat to bottom when messages change
  useEffect(() => {
    if (mode === "improve") {
      chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [improveMessages, mode]);

  // ---------- Edit ----------

  const handleOpenEdit = () => {
    setEditText(currentPrompt ?? "");
    setEditNote("");
    setMode("edit");
  };

  const handleSave = () => {
    if (!editText.trim()) return;
    withAuth(() => {
      updatePrompt.mutate(
        { id, prompt: editText.trim(), note: editNote || "manual edit" },
        { onSuccess: () => setMode("view") }
      );
    });
  };

  // ---------- Improve with AI ----------

  const extractProposedPrompt = useCallback((text: string) => {
    const m = text.match(/```strategy\n([\s\S]*?)```/);
    if (m) setProposedPrompt(m[1].trim());
  }, []);

  const sendImprove = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isImproving) return;
      setImproveInput("");
      setProposedPrompt(null);

      const history = improveMessages
        .filter((m) => !m.streaming)
        .map((m) => ({ role: m.role, content: m.content }));

      // For the first message, prepend the current prompt as context
      const messageText =
        history.length === 0 && currentPrompt
          ? `Here is the current strategy prompt:\n\n\`\`\`\n${currentPrompt}\n\`\`\`\n\nMy request: ${trimmed}`
          : trimmed;

      setImproveMessages((prev) => [
        ...prev,
        { role: "user", content: trimmed }, // show clean user text in UI
        { role: "assistant", content: "", streaming: true },
      ]);
      setIsImproving(true);

      const abort = new AbortController();
      abortRef.current = abort;

      const { sessionToken } = useAuthStore.getState();

      try {
        const res = await fetch("/api/v1/strategies/improve-prompt", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
          },
          body: JSON.stringify({ id, message: messageText, history }),
          signal: abort.signal,
        });

        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        let fullContent = "";

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
              let chunk: string;
              if (typeof parsed === "string") {
                chunk = parsed;
              } else if (
                parsed &&
                typeof parsed === "object" &&
                "error" in parsed
              ) {
                chunk = `⚠ ${(parsed as { error: string }).error}`;
              } else {
                continue;
              }
              fullContent += chunk;
              setImproveMessages((prev) => {
                const copy = [...prev];
                const last = copy[copy.length - 1];
                if (last?.streaming) {
                  copy[copy.length - 1] = {
                    ...last,
                    content: last.content + chunk,
                  };
                }
                return copy;
              });
            } catch {
              // ignore unparseable lines
            }
          }
        }

        extractProposedPrompt(fullContent);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setImproveMessages((prev) => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            if (last?.streaming) {
              copy[copy.length - 1] = {
                ...last,
                content:
                  last.content || "Error: " + (err as Error).message,
                streaming: false,
              };
            }
            return copy;
          });
        }
      } finally {
        setImproveMessages((prev) =>
          prev.map((m) => (m.streaming ? { ...m, streaming: false } : m))
        );
        setIsImproving(false);
        abortRef.current = null;
      }
    },
    [id, currentPrompt, improveMessages, isImproving, extractProposedPrompt]
  );

  const handleApplyProposed = () => {
    if (!proposedPrompt) return;
    withAuth(() => {
      updatePrompt.mutate(
        { id, prompt: proposedPrompt, note: "AI improvement" },
        {
          onSuccess: () => {
            setMode("view");
            setProposedPrompt(null);
            setImproveMessages([]);
          },
        }
      );
    });
  };

  // ---------- History / Diff ----------

  const toggleVersion = (v: number) => {
    setSelectedVersions((prev) => {
      if (prev.includes(v)) return prev.filter((x) => x !== v);
      if (prev.length >= 2) return [prev[1], v];
      return [...prev, v];
    });
  };

  const diffData = (() => {
    if (selectedVersions.length !== 2 || !versions) return null;
    const sorted = [...selectedVersions].sort((a, b) => a - b);
    const oldV = versions.find((v) => v.version === sorted[0]);
    const newV = versions.find((v) => v.version === sorted[1]);
    if (!oldV || !newV) return null;
    return {
      old: oldV,
      new: newV,
      changes: diffLines(oldV.prompt, newV.prompt),
    };
  })();

  // ---------- Render ----------

  const prompt = currentPrompt ?? "";

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center gap-2 text-left"
        >
          <span className="text-lg font-semibold text-white">Strategy Prompt</span>
          <svg
            className={cn(
              "w-4 h-4 text-gray-500 transition-transform duration-200",
              collapsed ? "" : "rotate-180"
            )}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {!collapsed && (
          <div className="flex gap-2">
            {mode !== "edit" && (
              <TabBtn active={mode === "view"} onClick={() => setMode("view")}>
                View
              </TabBtn>
            )}
            <TabBtn active={mode === "edit"} onClick={handleOpenEdit}>
              Edit
            </TabBtn>
            <TabBtn active={mode === "improve"} onClick={() => setMode("improve")}>
              Improve with AI
            </TabBtn>
            <TabBtn active={mode === "history"} onClick={() => setMode("history")}>
              History
              {versions && versions.length > 0 && (
                <span className="ml-1.5 text-xs bg-gray-700 text-gray-400 rounded-full px-1.5 py-0.5">
                  {versions.length}
                </span>
              )}
            </TabBtn>
          </div>
        )}
      </div>

      {!collapsed && (
      <div className="mt-4">

      {/* ── View ── */}
      {mode === "view" && (
        <pre className="text-sm text-gray-300 whitespace-pre-wrap font-sans leading-relaxed min-h-[4rem]">
          {prompt || (
            <span className="text-gray-600 italic">No prompt configured.</span>
          )}
        </pre>
      )}

      {/* ── Edit ── */}
      {mode === "edit" && (
        <div className="space-y-3">
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            rows={12}
            className="w-full bg-gray-950 border border-gray-700 rounded-lg px-4 py-3 text-sm text-gray-200 outline-none focus:border-blue-500 resize-y font-mono leading-relaxed"
          />
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={editNote}
              onChange={(e) => setEditNote(e.target.value)}
              placeholder="Change note (optional)"
              className="flex-1 bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 outline-none focus:border-blue-500"
            />
            <button
              onClick={handleSave}
              disabled={updatePrompt.isPending || !editText.trim()}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 disabled:opacity-40 transition-colors"
            >
              {updatePrompt.isPending ? "Saving…" : "Save"}
            </button>
            <button
              onClick={() => setMode("view")}
              className="px-4 py-2 rounded-lg bg-gray-800 text-gray-400 text-sm hover:text-gray-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Improve with AI ── */}
      {mode === "improve" && (
        <div className="space-y-3">
          {/* Proposed prompt banner with diff */}
          {proposedPrompt && (
            <ProposedPromptDiff
              currentPrompt={currentPrompt ?? ""}
              proposedPrompt={proposedPrompt}
              onApply={handleApplyProposed}
              applying={updatePrompt.isPending}
            />
          )}

          {/* Chat messages */}
          <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
            {improveMessages.length === 0 && (
              <p className="text-sm text-gray-500 italic">
                Describe how you'd like to improve the prompt. The AI will
                suggest an updated version.
              </p>
            )}
            {improveMessages.map((m, i) => (
              <div
                key={i}
                className={cn(
                  "flex",
                  m.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-xl px-4 py-2.5 text-sm whitespace-pre-wrap",
                    m.role === "user"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-800 text-gray-200 border border-gray-700"
                  )}
                >
                  {m.content}
                  {m.streaming && (
                    <span className="inline-flex gap-0.5 ml-1">
                      <span
                        className="animate-bounce"
                        style={{ animationDelay: "0ms" }}
                      >
                        ·
                      </span>
                      <span
                        className="animate-bounce"
                        style={{ animationDelay: "150ms" }}
                      >
                        ·
                      </span>
                      <span
                        className="animate-bounce"
                        style={{ animationDelay: "300ms" }}
                      >
                        ·
                      </span>
                    </span>
                  )}
                </div>
              </div>
            ))}
            <div ref={chatBottomRef} />
          </div>

          {/* Input */}
          <div className="flex gap-2">
            <textarea
              value={improveInput}
              onChange={(e) => setImproveInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendImprove(improveInput);
                }
              }}
              disabled={isImproving}
              placeholder="Describe how to improve the prompt… (Enter to send)"
              rows={2}
              className="flex-1 bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500 resize-none disabled:opacity-50"
            />
            {isImproving ? (
              <button
                onClick={() => abortRef.current?.abort()}
                className="px-3 py-2 rounded-lg bg-red-600/20 text-red-400 text-sm hover:bg-red-600/30 transition-colors whitespace-nowrap self-end"
              >
                Stop
              </button>
            ) : (
              <button
                onClick={() => sendImprove(improveInput)}
                disabled={!improveInput.trim()}
                className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-500 disabled:opacity-40 transition-colors whitespace-nowrap self-end"
              >
                Send
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── History ── */}
      {mode === "history" && (
        <div className="space-y-4">
          {/* Version list */}
          <div className="space-y-1">
            {!versions || versions.length === 0 ? (
              <p className="text-sm text-gray-500 italic">
                No history yet. Save a prompt to start tracking versions.
              </p>
            ) : (
              versions.map((v) => (
                <div
                  key={v.version}
                  className="flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-800/50 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selectedVersions.includes(v.version)}
                    onChange={() => toggleVersion(v.version)}
                    className="mt-0.5 accent-blue-500"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded">
                        v{v.version}
                      </span>
                      <span className="text-sm text-gray-300">{v.note}</span>
                      <span className="text-xs text-gray-600 ml-auto">
                        {new Date(v.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1 truncate">
                      {v.prompt.slice(0, 120)}
                      {v.prompt.length > 120 ? "…" : ""}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>

          {selectedVersions.length > 0 && selectedVersions.length < 2 && (
            <p className="text-xs text-gray-500 text-center">
              Select one more version to compare
            </p>
          )}

          {/* Diff viewer */}
          {diffData && (
            <div className="border border-gray-700 rounded-lg overflow-hidden">
              {/* Diff header */}
              <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
                <span className="text-xs text-gray-400">
                  Comparing{" "}
                  <span className="text-red-400 font-mono">
                    v{diffData.old.version}
                  </span>{" "}
                  →{" "}
                  <span className="text-green-400 font-mono">
                    v{diffData.new.version}
                  </span>
                </span>
                <div className="flex gap-1">
                  <DiffModeBtn
                    active={diffMode === "inline"}
                    onClick={() => setDiffMode("inline")}
                  >
                    Inline
                  </DiffModeBtn>
                  <DiffModeBtn
                    active={diffMode === "split"}
                    onClick={() => setDiffMode("split")}
                  >
                    Side by side
                  </DiffModeBtn>
                </div>
              </div>

              {/* Diff body */}
              <div className="overflow-x-auto text-xs font-mono">
                {diffMode === "inline" ? (
                  <InlineDiff changes={diffData.changes} />
                ) : (
                  <SplitDiff changes={diffData.changes} />
                )}
              </div>
            </div>
          )}
        </div>
      )}
      </div>
      )}
    </div>
  );
}

// ─── Diff renderers ────────────────────────────────────────────────────────

function InlineDiff({ changes }: { changes: Change[] }) {
  return (
    <div>
      {changes.map((change, i) => {
        const lines = splitLines(change.value);
        return lines.map((line, j) => (
          <div
            key={`${i}-${j}`}
            className={cn(
              "px-4 py-0.5 whitespace-pre leading-5",
              change.added
                ? "bg-green-900/25 text-green-300"
                : change.removed
                ? "bg-red-900/25 text-red-300"
                : "text-gray-400"
            )}
          >
            <span className="select-none mr-2 text-gray-600">
              {change.added ? "+" : change.removed ? "−" : " "}
            </span>
            {line}
          </div>
        ));
      })}
    </div>
  );
}

function SplitDiff({ changes }: { changes: Change[] }) {
  // Build parallel arrays of left/right lines
  const leftLines: { text: string; type: "removed" | "unchanged" }[] = [];
  const rightLines: { text: string; type: "added" | "unchanged" }[] = [];

  for (const change of changes) {
    const lines = splitLines(change.value);
    if (change.removed) {
      for (const line of lines) leftLines.push({ text: line, type: "removed" });
    } else if (change.added) {
      for (const line of lines) rightLines.push({ text: line, type: "added" });
    } else {
      for (const line of lines) {
        leftLines.push({ text: line, type: "unchanged" });
        rightLines.push({ text: line, type: "unchanged" });
      }
    }
  }

  const maxLen = Math.max(leftLines.length, rightLines.length);

  return (
    <table className="w-full table-fixed border-collapse">
      <colgroup>
        <col style={{ width: "calc(50% - 0.5px)" }} />
        <col style={{ width: "1px" }} />
        <col style={{ width: "calc(50% - 0.5px)" }} />
      </colgroup>
      <tbody>
        {Array.from({ length: maxLen }).map((_, i) => {
          const left = leftLines[i];
          const right = rightLines[i];
          return (
            <tr key={i}>
              <td
                className={cn(
                  "px-4 py-0.5 whitespace-pre-wrap break-words leading-5 align-top overflow-hidden",
                  left?.type === "removed"
                    ? "bg-red-900/25 text-red-300"
                    : "text-gray-400"
                )}
              >
                {left?.text ?? ""}
              </td>
              <td className="bg-gray-700" />
              <td
                className={cn(
                  "px-4 py-0.5 whitespace-pre-wrap break-words leading-5 align-top overflow-hidden",
                  right?.type === "added"
                    ? "bg-green-900/25 text-green-300"
                    : "text-gray-400"
                )}
              >
                {right?.text ?? ""}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ─── Proposed prompt diff ────────────────────────────────────────────────────

function ProposedPromptDiff({
  currentPrompt,
  proposedPrompt,
  onApply,
  applying,
}: {
  currentPrompt: string;
  proposedPrompt: string;
  onApply: () => void;
  applying: boolean;
}) {
  const [viewMode, setViewMode] = useState<"diff" | "full">("diff");
  const [proposedDiffMode, setProposedDiffMode] = useState<DiffViewMode>("inline");
  const changes = diffLines(currentPrompt, proposedPrompt);

  return (
    <div className="bg-green-900/20 border border-green-700/40 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-green-700/30">
        <span className="text-sm text-green-400 font-medium">
          AI proposed an improved prompt
        </span>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 mr-2">
            <DiffModeBtn
              active={viewMode === "diff"}
              onClick={() => setViewMode("diff")}
            >
              Diff
            </DiffModeBtn>
            <DiffModeBtn
              active={viewMode === "full"}
              onClick={() => setViewMode("full")}
            >
              Full
            </DiffModeBtn>
          </div>
          {viewMode === "diff" && (
            <div className="flex gap-1 mr-2">
              <DiffModeBtn
                active={proposedDiffMode === "inline"}
                onClick={() => setProposedDiffMode("inline")}
              >
                Inline
              </DiffModeBtn>
              <DiffModeBtn
                active={proposedDiffMode === "split"}
                onClick={() => setProposedDiffMode("split")}
              >
                Side by side
              </DiffModeBtn>
            </div>
          )}
          <button
            onClick={onApply}
            disabled={applying}
            className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-medium hover:bg-green-500 disabled:opacity-40 transition-colors"
          >
            {applying ? "Applying…" : "Apply Prompt"}
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="max-h-64 overflow-y-auto text-xs font-mono">
        {viewMode === "diff" ? (
          proposedDiffMode === "inline" ? (
            <InlineDiff changes={changes} />
          ) : (
            <SplitDiff changes={changes} />
          )
        ) : (
          <pre className="px-4 py-3 text-gray-300 whitespace-pre-wrap leading-5">
            {proposedPrompt}
          </pre>
        )}
      </div>
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Split a diff chunk value into display lines, dropping the trailing empty. */
function splitLines(value: string): string[] {
  const lines = value.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center text-xs px-3 py-1.5 rounded-lg transition-colors",
        active
          ? "bg-blue-600/20 text-blue-400"
          : "text-gray-500 hover:text-gray-300 hover:bg-gray-800"
      )}
    >
      {children}
    </button>
  );
}

function DiffModeBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "text-xs px-2 py-1 rounded transition-colors",
        active
          ? "bg-gray-600 text-white"
          : "text-gray-500 hover:text-gray-300"
      )}
    >
      {children}
    </button>
  );
}
