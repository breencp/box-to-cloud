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
    <div className="flex flex-col gap-3 p-4 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 relative">
      <button
        className="flex items-center justify-center gap-2 py-4 px-6 text-white bg-red-600 hover:bg-red-700 disabled:hover:bg-red-600 rounded-lg"
        onClick={() => onDecision("shred")}
        disabled={disabled}
        title="Press 1 or S"
      >
        <span className="font-semibold text-lg">SHRED</span>
        <span className="text-sm opacity-80">(1)</span>
      </button>

      <button
        className="flex items-center justify-center gap-2 py-4 px-6 text-white bg-amber-500 hover:bg-amber-600 disabled:hover:bg-amber-500 rounded-lg"
        onClick={() => onDecision("unsure")}
        disabled={disabled}
        title="Press 2 or U"
      >
        <span className="font-semibold text-lg">UNSURE</span>
        <span className="text-sm opacity-80">(2)</span>
      </button>

      <button
        className="flex items-center justify-center gap-2 py-4 px-6 text-white bg-green-600 hover:bg-green-700 disabled:hover:bg-green-600 rounded-lg"
        onClick={() => onDecision("retain")}
        disabled={disabled}
        title="Press 3 or R"
      >
        <span className="font-semibold text-lg">RETAIN</span>
        <span className="text-sm opacity-80">(3)</span>
      </button>

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-gray-900/70 font-medium text-gray-500">
          Submitting...
        </div>
      )}
    </div>
  );
}
