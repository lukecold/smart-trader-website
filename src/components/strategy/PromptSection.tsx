import { useState } from "react";
import { diffLines, type Change } from "diff";
import { cn } from "@/lib/utils";
import { usePromptHistory, useUpdatePrompt } from "@/api/strategies";
import { useAuthGuard } from "@/hooks/useAuthGuard";

type Mode = "view" | "edit" | "history";
type DiffViewMode = "inline" | "split";

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

  // History / diff state
  const [selectedVersions, setSelectedVersions] = useState<number[]>([]);
  const [diffMode, setDiffMode] = useState<DiffViewMode>("inline");

  const { data: versions } = usePromptHistory(id);
  const updatePrompt = useUpdatePrompt();
  const { withAuth } = useAuthGuard();

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

export function InlineDiff({ changes }: { changes: Change[] }) {
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

// ─── Helpers ───────────────────────────────────────────────────────────────

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
