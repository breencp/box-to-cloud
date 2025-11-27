"use client";

import { ProgressBar } from "./ProgressBar";

interface BoxCardProps {
  box: {
    id: string;
    boxNumber: string;
    totalPages: number;
    pagesReviewed: number;
    pagesShred: number;
    pagesUnsure: number;
    pagesRetain: number;
    status: string;
  };
}

export function BoxCard({ box }: BoxCardProps) {
  const percentComplete =
    box.totalPages > 0
      ? Math.round((box.pagesReviewed / box.totalPages) * 100)
      : 0;

  let recommendation: string | null = null;
  if (box.status === "complete") {
    if (box.pagesRetain > 0) {
      recommendation = "RETAIN";
    } else if (box.pagesUnsure > 0) {
      recommendation = "REVIEW";
    } else {
      recommendation = "SHRED";
    }
  }

  const statusClasses = {
    pending: "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400",
    in_progress: "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400",
    complete: "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400",
  };

  const borderClasses = {
    pending: "border-gray-200 dark:border-gray-700",
    in_progress: "border-blue-300 dark:border-blue-700",
    complete: "border-green-300 dark:border-green-700",
  };

  const recommendationClasses = {
    SHRED: "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400",
    RETAIN: "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400",
    REVIEW: "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400",
  };

  return (
    <div
      className={`bg-white dark:bg-gray-800 border rounded-lg p-4 flex flex-col gap-3 ${
        borderClasses[box.status as keyof typeof borderClasses] || borderClasses.pending
      }`}
    >
      <div className="flex justify-between items-center">
        <h4 className="font-semibold text-gray-900 dark:text-gray-100 m-0">
          Box {box.boxNumber}
        </h4>
        <span
          className={`text-xs px-2 py-1 rounded font-medium ${
            statusClasses[box.status as keyof typeof statusClasses] || statusClasses.pending
          }`}
        >
          {box.status === "in_progress"
            ? "In Progress"
            : box.status.charAt(0).toUpperCase() + box.status.slice(1)}
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {box.pagesReviewed} / {box.totalPages} pages
        </span>
        <ProgressBar value={box.pagesReviewed} max={box.totalPages} />
      </div>

      {box.pagesReviewed > 0 && (
        <div className="flex gap-4 text-xs">
          <span className="text-red-600">{box.pagesShred} shred</span>
          <span className="text-amber-500">{box.pagesUnsure} unsure</span>
          <span className="text-green-600">{box.pagesRetain} retain</span>
        </div>
      )}

      {recommendation && (
        <div
          className={`text-xs font-semibold p-2 rounded text-center ${
            recommendationClasses[recommendation as keyof typeof recommendationClasses]
          }`}
        >
          {recommendation === "SHRED" && "Safe to Shred"}
          {recommendation === "RETAIN" && "Contains Retain Items"}
          {recommendation === "REVIEW" && "Needs Review"}
        </div>
      )}
    </div>
  );
}
