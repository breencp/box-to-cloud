"use client";

import { ProgressBar } from "./ProgressBar";

interface PageContextProps {
  boxNumber: string;
  filename: string;
  pageNumber: number;
  totalPages: number;
  pagesReviewed: number;
}

export function PageContext({
  boxNumber,
  filename,
  pageNumber,
  totalPages,
  pagesReviewed,
}: PageContextProps) {
  const percentComplete =
    totalPages > 0 ? Math.round((pagesReviewed / totalPages) * 100) : 0;

  return (
    <div className="flex flex-col gap-2 px-8 py-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 max-sm:px-4 max-sm:py-3">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="font-semibold text-gray-900 dark:text-gray-100">
          Box {boxNumber}
        </span>
        <span className="text-gray-200 dark:text-gray-600">|</span>
        <span className="text-gray-500 dark:text-gray-400 text-sm">
          {filename}
        </span>
        <span className="text-gray-200 dark:text-gray-600">|</span>
        <span className="text-gray-500 dark:text-gray-400 text-sm">
          Page {pageNumber}
        </span>
      </div>
      <div className="flex items-center gap-4 max-sm:flex-col max-sm:items-start max-sm:gap-2">
        <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
          {pagesReviewed} of {totalPages} pages reviewed ({percentComplete}%)
        </span>
        <ProgressBar value={pagesReviewed} max={totalPages} />
      </div>
    </div>
  );
}
