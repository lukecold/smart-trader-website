import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/**
 * Renders untrusted LLM markdown (decision rationale) safely.
 *
 * The rationale text is GFM — prose plus pipe tables (e.g. 【持仓风险管理表】).
 * Dumping it into a plain <p> collapses the newlines and shows raw pipes, so we
 * parse it here. Raw HTML is intentionally NOT enabled (no rehype-raw), keeping
 * model output XSS-safe.
 */
export function Markdown({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2 text-sm text-gray-300", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ node, ...props }) => (
            <p className="leading-relaxed" {...props} />
          ),
          a: ({ node, ...props }) => (
            <a
              className="text-blue-400 hover:underline"
              target="_blank"
              rel="noopener noreferrer"
              {...props}
            />
          ),
          strong: ({ node, ...props }) => (
            <strong className="font-semibold text-gray-200" {...props} />
          ),
          em: ({ node, ...props }) => <em className="italic" {...props} />,
          ul: ({ node, ...props }) => (
            <ul className="list-disc space-y-1 pl-5" {...props} />
          ),
          ol: ({ node, ...props }) => (
            <ol className="list-decimal space-y-1 pl-5" {...props} />
          ),
          li: ({ node, ...props }) => <li className="leading-relaxed" {...props} />,
          h1: ({ node, ...props }) => (
            <h4 className="text-base font-semibold text-gray-200" {...props} />
          ),
          h2: ({ node, ...props }) => (
            <h4 className="text-sm font-semibold text-gray-200" {...props} />
          ),
          h3: ({ node, ...props }) => (
            <h5 className="text-sm font-semibold text-gray-300" {...props} />
          ),
          blockquote: ({ node, ...props }) => (
            <blockquote
              className="border-l-2 border-gray-700 pl-3 text-gray-500"
              {...props}
            />
          ),
          hr: () => <hr className="border-gray-800" />,
          code: ({ node, ...props }) => (
            <code
              className="rounded bg-gray-800 px-1 py-0.5 font-mono text-xs text-gray-200"
              {...props}
            />
          ),
          pre: ({ node, ...props }) => (
            <pre
              className="overflow-x-auto rounded-lg bg-gray-800 p-3 font-mono text-xs text-gray-200"
              {...props}
            />
          ),
          // Tables are the main reason this component exists. Wrap so wide
          // tables (many columns + CJK headers) scroll instead of overflowing.
          table: ({ node, ...props }) => (
            <div className="overflow-x-auto">
              <table
                className="w-full border-collapse text-xs text-gray-300"
                {...props}
              />
            </div>
          ),
          thead: ({ node, ...props }) => (
            <thead className="bg-gray-800/70" {...props} />
          ),
          th: ({ node, ...props }) => (
            <th
              className="whitespace-nowrap border border-gray-700 px-2.5 py-1.5 text-left font-medium text-gray-300"
              {...props}
            />
          ),
          td: ({ node, ...props }) => (
            <td
              className="border border-gray-800 px-2.5 py-1.5 align-top text-gray-400"
              {...props}
            />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
