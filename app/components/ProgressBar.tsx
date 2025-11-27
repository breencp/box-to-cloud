"use client";

interface ProgressBarProps {
  value: number;
  max: number;
  showLabel?: boolean;
  variant?: "default" | "shred" | "unsure" | "retain";
}

export function ProgressBar({
  value,
  max,
  showLabel = false,
  variant = "default",
}: ProgressBarProps) {
  const percentage = max > 0 ? Math.round((value / max) * 100) : 0;

  const variantClasses = {
    default: "bg-blue-600",
    shred: "bg-red-600",
    unsure: "bg-amber-500",
    retain: "bg-green-600",
  };

  return (
    <div className="flex items-center gap-2 flex-1">
      <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded overflow-hidden">
        <div
          className={`h-full rounded transition-all duration-300 ${variantClasses[variant]}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {showLabel && (
        <span className="text-xs text-gray-500 dark:text-gray-400 min-w-[36px] text-right">
          {percentage}%
        </span>
      )}
    </div>
  );
}
