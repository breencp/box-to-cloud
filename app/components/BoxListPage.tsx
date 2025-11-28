"use client";

import { useState, useEffect } from "react";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";
import { ProgressBar } from "./ProgressBar";

const client = generateClient<Schema>();

interface Box {
  id: string;
  boxNumber: string;
  totalSets: number;
  totalPages: number;
  pagesReviewed: number;
  pagesShred: number;
  pagesUnsure: number;
  pagesRetain: number;
  status: string;
}

export function BoxListPage() {
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    async function fetchBoxes() {
      try {
        const { data } = await client.models.Box2CloudBox.list();
        if (data) {
          setBoxes(
            data.map((box) => ({
              id: box.id,
              boxNumber: box.boxNumber || "",
              totalSets: box.totalSets || 0,
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
        console.error("Error fetching boxes:", err);
        setError("Failed to load boxes.");
      } finally {
        setLoading(false);
      }
    }

    fetchBoxes();
  }, []);

  const getRecommendation = (box: Box): string | null => {
    if (box.status !== "complete") return null;
    if (box.pagesRetain > 0) return "RETAIN";
    if (box.pagesUnsure > 0) return "REVIEW";
    return "SHRED";
  };

  const filteredBoxes = boxes.filter((box) => {
    if (filter === "all") return true;
    if (filter === "pending") return box.status === "pending";
    if (filter === "in_progress") return box.status === "in_progress";
    if (filter === "complete") return box.status === "complete";
    if (filter === "shred")
      return box.status === "complete" && getRecommendation(box) === "SHRED";
    if (filter === "retain")
      return box.status === "complete" && getRecommendation(box) === "RETAIN";
    return true;
  });

  const filterButtonClass = (filterName: string, isShred = false) =>
    `px-4 py-2 text-sm rounded-lg border transition-colors ${
      filter === filterName
        ? isShred
          ? "bg-red-600 text-white border-red-600"
          : "bg-blue-600 text-white border-blue-600"
        : "bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100"
    }`;

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto p-8">
        <div className="flex justify-center py-16 text-gray-500 dark:text-gray-400">
          Loading boxes...
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
      <div className="flex justify-between items-center mb-6 flex-wrap gap-4 max-md:flex-col max-md:items-start">
        <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
          All Boxes
        </h2>
        <div className="flex gap-2 flex-wrap">
          <button
            className={filterButtonClass("all")}
            onClick={() => setFilter("all")}
          >
            All ({boxes.length})
          </button>
          <button
            className={filterButtonClass("pending")}
            onClick={() => setFilter("pending")}
          >
            Pending ({boxes.filter((b) => b.status === "pending").length})
          </button>
          <button
            className={filterButtonClass("in_progress")}
            onClick={() => setFilter("in_progress")}
          >
            In Progress (
            {boxes.filter((b) => b.status === "in_progress").length})
          </button>
          <button
            className={filterButtonClass("complete")}
            onClick={() => setFilter("complete")}
          >
            Complete ({boxes.filter((b) => b.status === "complete").length})
          </button>
          <button
            className={filterButtonClass("shred", true)}
            onClick={() => setFilter("shred")}
          >
            Safe to Shred (
            {
              boxes.filter(
                (b) =>
                  b.status === "complete" && getRecommendation(b) === "SHRED"
              ).length
            }
            )
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        {/* Table Header */}
        <div className="hidden md:grid grid-cols-[100px_100px_80px_1fr_120px_100px_120px] gap-4 px-4 py-3 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
          <span>Box</span>
          <span>Sets</span>
          <span>Pages</span>
          <span>Progress</span>
          <span>Breakdown</span>
          <span>Status</span>
          <span>Recommendation</span>
        </div>

        {/* Table Rows */}
        {filteredBoxes
          .sort((a, b) => a.boxNumber.localeCompare(b.boxNumber))
          .map((box) => {
            const recommendation = getRecommendation(box);
            const percentComplete =
              box.totalPages > 0
                ? Math.round((box.pagesReviewed / box.totalPages) * 100)
                : 0;

            const statusClasses = {
              pending:
                "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400",
              in_progress:
                "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400",
              complete:
                "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400",
            };

            return (
              <div
                key={box.id}
                className="grid md:grid-cols-[100px_100px_80px_1fr_120px_100px_120px] gap-4 px-4 py-3 border-b border-gray-200 dark:border-gray-700 last:border-b-0 text-sm items-center hover:bg-gray-50 dark:hover:bg-gray-900 max-md:flex max-md:flex-col max-md:items-start max-md:gap-2"
              >
                <span className="font-semibold text-gray-900 dark:text-gray-100">
                  Box {box.boxNumber}
                </span>
                <span className="text-gray-600 dark:text-gray-300">
                  {box.totalSets}
                </span>
                <span className="text-gray-600 dark:text-gray-300">
                  {box.totalPages}
                </span>
                <div className="flex items-center gap-2 w-full">
                  <ProgressBar
                    value={box.pagesReviewed}
                    max={box.totalPages}
                  />
                  <span className="text-xs text-gray-500 dark:text-gray-400 min-w-[32px]">
                    {percentComplete}%
                  </span>
                </div>
                <div className="flex items-center gap-1 text-xs">
                  <span className="text-red-600">{box.pagesShred}</span>
                  <span className="text-gray-300 dark:text-gray-600">/</span>
                  <span className="text-amber-500">{box.pagesUnsure}</span>
                  <span className="text-gray-300 dark:text-gray-600">/</span>
                  <span className="text-green-600">{box.pagesRetain}</span>
                </div>
                <span
                  className={`text-xs px-2 py-1 rounded font-medium text-center ${
                    statusClasses[box.status as keyof typeof statusClasses] ||
                    statusClasses.pending
                  }`}
                >
                  {box.status === "in_progress"
                    ? "In Progress"
                    : box.status.charAt(0).toUpperCase() + box.status.slice(1)}
                </span>
                <span
                  className={`text-xs font-medium text-center ${
                    recommendation === "SHRED"
                      ? "text-red-600"
                      : recommendation === "RETAIN"
                        ? "text-green-600"
                        : recommendation === "REVIEW"
                          ? "text-amber-500"
                          : "text-gray-400"
                  }`}
                >
                  {recommendation === "SHRED" && "Safe to Shred"}
                  {recommendation === "RETAIN" && "Retain"}
                  {recommendation === "REVIEW" && "Needs Review"}
                  {!recommendation && "-"}
                </span>
              </div>
            );
          })}
      </div>

      {filteredBoxes.length === 0 && (
        <div className="flex justify-center py-16 text-gray-500 dark:text-gray-400">
          No boxes match the selected filter.
        </div>
      )}
    </div>
  );
}
