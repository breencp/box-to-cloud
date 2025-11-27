"use client";

import { useState, useEffect } from "react";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";
import { ProgressBar } from "./ProgressBar";
import { BoxCard } from "./BoxCard";

const client = generateClient<Schema>();

interface BoxSummary {
  id: string;
  boxNumber: string;
  totalPages: number;
  pagesReviewed: number;
  pagesShred: number;
  pagesUnsure: number;
  pagesRetain: number;
  status: string;
}

export function ProgressPage() {
  const [boxes, setBoxes] = useState<BoxSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchProgress() {
      try {
        const { data } = await client.models.Box.list();
        if (data) {
          setBoxes(
            data.map((box) => ({
              id: box.id,
              boxNumber: box.boxNumber || "",
              totalPages: box.totalPages || 0,
              pagesReviewed: box.pagesReviewed || 0,
              pagesShred: box.pagesShred || 0,
              pagesUnsure: box.pagesUnsure || 0,
              pagesRetain: box.pagesRetain || 0,
              status: box.status || "pending",
            }))
          );
        }
      } catch (err) {
        console.error("Error fetching progress:", err);
        setError("Failed to load progress data.");
      } finally {
        setLoading(false);
      }
    }

    fetchProgress();
  }, []);

  const totalPages = boxes.reduce((sum, box) => sum + box.totalPages, 0);
  const pagesReviewed = boxes.reduce((sum, box) => sum + box.pagesReviewed, 0);
  const pagesShred = boxes.reduce((sum, box) => sum + box.pagesShred, 0);
  const pagesUnsure = boxes.reduce((sum, box) => sum + box.pagesUnsure, 0);
  const pagesRetain = boxes.reduce((sum, box) => sum + box.pagesRetain, 0);
  const pagesRemaining = totalPages - pagesReviewed;
  const percentComplete =
    totalPages > 0 ? Math.round((pagesReviewed / totalPages) * 100) : 0;

  const boxesComplete = boxes.filter((b) => b.status === "complete").length;
  const boxesInProgress = boxes.filter((b) => b.status === "in_progress").length;
  const boxesPending = boxes.filter((b) => b.status === "pending").length;

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto p-8">
        <div className="flex justify-center py-16 text-gray-500 dark:text-gray-400">
          Loading progress...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto p-8">
        <div className="flex justify-center py-16 text-red-600 dark:text-red-400">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-8 max-md:p-4">
      <div className="mb-8">
        <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
          Review Progress
        </h2>
      </div>

      {/* Overview Section */}
      <div className="grid grid-cols-[2fr_1fr] gap-8 mb-8 max-md:grid-cols-1">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="flex justify-between mb-3">
            <span className="font-semibold text-gray-900 dark:text-gray-100">
              Overall Progress
            </span>
            <span className="text-gray-500 dark:text-gray-400 text-sm">
              {pagesReviewed.toLocaleString()} of {totalPages.toLocaleString()}{" "}
              pages
            </span>
          </div>
          <ProgressBar value={pagesReviewed} max={totalPages} showLabel />
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            {pagesRemaining.toLocaleString()} pages remaining
          </p>
        </div>

        <div className="flex flex-col gap-4 max-md:flex-row max-md:justify-between">
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700 flex flex-col items-center max-md:flex-1">
            <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {percentComplete}%
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Complete
            </span>
          </div>
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700 flex flex-col items-center max-md:flex-1">
            <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {boxes.length}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Total Boxes
            </span>
          </div>
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700 flex flex-col items-center max-md:flex-1">
            <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {boxesComplete}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Boxes Done
            </span>
          </div>
        </div>
      </div>

      {/* Decision Breakdown */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">
          Decision Breakdown
        </h3>
        <div className="grid grid-cols-3 gap-4 max-md:grid-cols-1">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700 flex flex-col gap-2">
            <span className="text-2xl font-bold text-red-600">
              {pagesShred.toLocaleString()}
            </span>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Shred
            </span>
            <ProgressBar
              value={pagesShred}
              max={pagesReviewed || 1}
              variant="shred"
            />
          </div>
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700 flex flex-col gap-2">
            <span className="text-2xl font-bold text-amber-500">
              {pagesUnsure.toLocaleString()}
            </span>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Unsure
            </span>
            <ProgressBar
              value={pagesUnsure}
              max={pagesReviewed || 1}
              variant="unsure"
            />
          </div>
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700 flex flex-col gap-2">
            <span className="text-2xl font-bold text-green-600">
              {pagesRetain.toLocaleString()}
            </span>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Retain
            </span>
            <ProgressBar
              value={pagesRetain}
              max={pagesReviewed || 1}
              variant="retain"
            />
          </div>
        </div>
      </div>

      {/* Boxes Section */}
      <div>
        <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">
          Boxes Status
        </h3>
        <div className="flex gap-8 mb-4 text-sm text-gray-500 dark:text-gray-400 flex-wrap max-md:gap-4">
          <span>
            <strong className="text-gray-900 dark:text-gray-100">
              {boxesComplete}
            </strong>{" "}
            Complete
          </span>
          <span>
            <strong className="text-gray-900 dark:text-gray-100">
              {boxesInProgress}
            </strong>{" "}
            In Progress
          </span>
          <span>
            <strong className="text-gray-900 dark:text-gray-100">
              {boxesPending}
            </strong>{" "}
            Pending
          </span>
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
          {boxes
            .sort((a, b) => a.boxNumber.localeCompare(b.boxNumber))
            .map((box) => (
              <BoxCard key={box.id} box={box} />
            ))}
        </div>
      </div>
    </div>
  );
}
