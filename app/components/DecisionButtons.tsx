"use client";

import type { ReviewDecision } from "../types";

interface DecisionButtonsProps {
  onDecision: (decision: ReviewDecision) => void;
  disabled?: boolean;
  loading?: boolean;
}

export function DecisionButtons({
  onDecision,
  disabled = false,
  loading = false,
}: DecisionButtonsProps) {
  return (
    <div className="flex gap-4 p-6 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 relative max-sm:flex-col max-sm:p-4">
      <button
        className="flex-1 flex flex-col items-center gap-1 py-4 px-8 text-white bg-red-600 hover:bg-red-700 disabled:hover:bg-red-600 rounded-lg min-h-[70px] max-sm:py-3 max-sm:min-h-[60px]"
        onClick={() => onDecision("shred")}
        disabled={disabled}
        title="Press 1 or S"
      >
        <span className="font-semibold text-lg">SHRED</span>
        <span className="text-xs opacity-80">(1)</span>
      </button>

      <button
        className="flex-1 flex flex-col items-center gap-1 py-4 px-8 text-white bg-amber-500 hover:bg-amber-600 disabled:hover:bg-amber-500 rounded-lg min-h-[70px] max-sm:py-3 max-sm:min-h-[60px]"
        onClick={() => onDecision("unsure")}
        disabled={disabled}
        title="Press 2 or U"
      >
        <span className="font-semibold text-lg">UNSURE</span>
        <span className="text-xs opacity-80">(2)</span>
      </button>

      <button
        className="flex-1 flex flex-col items-center gap-1 py-4 px-8 text-white bg-green-600 hover:bg-green-700 disabled:hover:bg-green-600 rounded-lg min-h-[70px] max-sm:py-3 max-sm:min-h-[60px]"
        onClick={() => onDecision("retain")}
        disabled={disabled}
        title="Press 3 or R"
      >
        <span className="font-semibold text-lg">RETAIN</span>
        <span className="text-xs opacity-80">(3)</span>
      </button>

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-gray-900/70 font-medium text-gray-500">
          Submitting...
        </div>
      )}
    </div>
  );
}
