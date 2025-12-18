"use client";

import { useState, useEffect, useRef } from "react";
import { ChevronDown, ChevronRight, Brain, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import { cn } from "@/lib/utils";
import "katex/dist/katex.min.css";
import { SyntaxHighlighter } from "@/components/thread/syntax-highlighter";

const thinkingComponents: any = {
  h1: ({ className, ...props }: { className?: string }) => (
    <h1 className={cn("mb-2 text-lg font-bold", className)} {...props} />
  ),
  h2: ({ className, ...props }: { className?: string }) => (
    <h2 className={cn("mt-2 mb-2 text-base font-bold", className)} {...props} />
  ),
  h3: ({ className, ...props }: { className?: string }) => (
    <h3 className={cn("mt-2 mb-1 text-sm font-bold", className)} {...props} />
  ),
  p: ({ className, ...props }: { className?: string }) => (
    <p className={cn("my-1 leading-normal first:mt-0 last:mb-0", className)} {...props} />
  ),
  a: ({ className, ...props }: { className?: string }) => (
    <a
      className={cn("text-primary underline underline-offset-2", className)}
      {...props}
    />
  ),
  ul: ({ className, ...props }: { className?: string }) => (
    <ul className={cn("my-1 ml-4 list-disc", className)} {...props} />
  ),
  ol: ({ className, ...props }: { className?: string }) => (
    <ol className={cn("my-1 ml-4 list-decimal", className)} {...props} />
  ),
  blockquote: ({ className, ...props }: { className?: string }) => (
    <blockquote
      className={cn("border-l-2 pl-4 italic text-muted-foreground", className)}
      {...props}
    />
  ),
  table: ({ className, ...props }: { className?: string }) => (
    <table
      className={cn(
        "my-2 w-full border-separate border-spacing-0 overflow-y-auto text-sm",
        className,
      )}
      {...props}
    />
  ),
  th: ({ className, ...props }: { className?: string }) => (
    <th
      className={cn(
        "bg-muted px-2 py-1 text-left font-bold first:rounded-tl-lg last:rounded-tr-lg",
        className,
      )}
      {...props}
    />
  ),
  td: ({ className, ...props }: { className?: string }) => (
    <td
      className={cn(
        "border-b border-l px-2 py-1 text-left last:border-r",
        className,
      )}
      {...props}
    />
  ),
  tr: ({ className, ...props }: { className?: string }) => (
    <tr
      className={cn(
        "m-0 border-b p-0 first:border-t [&:last-child>td:first-child]:rounded-bl-lg [&:last-child>td:last-child]:rounded-br-lg",
        className,
      )}
      {...props}
    />
  ),
  code: ({ className, children, ...props }: { className?: string; children: React.ReactNode }) => {
    const match = /language-(\w+)/.exec(className || "");
    if (match) {
        return (
            <SyntaxHighlighter language={match[1]} className={cn("text-xs my-2", className)}>
                {String(children).replace(/\n$/, "")}
            </SyntaxHighlighter>
        )
    }
    return <code className={cn("rounded bg-muted px-1 py-0.5 font-mono text-xs", className)} {...props}>{children}</code>;
  },
  pre: ({ className, ...props }: { className?: string }) => (
    <pre
      className={cn(
        "max-w-4xl overflow-x-auto rounded-lg bg-black/5 p-2",
        className,
      )}
      {...props}
    />
  ),
};

interface ThinkingProps {
  content?: string;
  children?: React.ReactNode;
  isLoading?: boolean;
}

export function Thinking({ content, children, isLoading = false }: ThinkingProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [duration, setDuration] = useState(0);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isLoading) {
      if (startTimeRef.current === null) {
        startTimeRef.current = Date.now() - duration;
      }
      interval = setInterval(() => {
        if (startTimeRef.current !== null) {
          setDuration(Date.now() - startTimeRef.current);
        }
      }, 100);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isLoading]);

  const formatDuration = (ms: number) => {
    if (ms < 1000 && ms > 0) return `${(ms / 1000).toFixed(1)}s`;
    if (ms === 0) return "0s";
    
    if (ms < 60000) {
      return `${(ms / 1000).toFixed(1)}s`;
    }
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  };

  if (!content && !children && !isLoading) return null;

  return (
    <div className="mb-4 overflow-hidden rounded-lg border border-border bg-muted/30">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
      >
        {isLoading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Brain className="h-3.5 w-3.5" />
        )}
        <span>Thinking Process ({formatDuration(duration)})</span>
        {isOpen ? (
          <ChevronDown className="ml-auto h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="ml-auto h-3.5 w-3.5" />
        )}
      </button>
      {isOpen && (
        <div className="px-4 pb-3 pt-1 text-sm text-muted-foreground/90">
          {content && (
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[rehypeKatex]}
              components={thinkingComponents}
            >
              {content}
            </ReactMarkdown>
          )}
          {children}
        </div>
      )}
    </div>
  );
}
