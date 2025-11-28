"use client";

import { useState, useEffect, useCallback } from "react";
import { generateClient } from "aws-amplify/data";
import { fetchAuthSession } from "aws-amplify/auth";
import type { Schema } from "@/amplify/data/resource";
import { DecisionButtons } from "./DecisionButtons";
import { PageContext } from "./PageContext";
import { PageImage } from "./PageImage";
import type { ReviewDecision } from "../types";

const client = generateClient<Schema>();

interface CurrentPage {
  id: string;
  pageId: string;
  boxId: string;
  setId: string;
  tenantId: string;
  pageNumber: number;
  filename: string;
  s3Key: string;
  boxNumber?: string;
  boxTotalPages?: number;
  boxPagesReviewed?: number;
}

export function ReviewPage() {
  const [currentPage, setCurrentPage] = useState<CurrentPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queueEmpty, setQueueEmpty] = useState(false);

  const fetchNextPage = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Get current user ID for lock checking
      const session = await fetchAuthSession();
      const userId = session.tokens?.idToken?.payload?.sub as string || "unknown";
      const now = new Date();
      const lockExpiryTime = new Date(now.getTime() - 5 * 60 * 1000); // 5 minutes ago

      // Fetch pages and filter client-side for pending status
      // Note: GraphQL enum filter doesn't work with records created via boto3
      const { data: allPages } = await client.models.Box2CloudPage.list({
        limit: 1000,
      });

      // Filter for pending pages and sort by box number, then page number
      const pendingPages = (allPages?.filter(p => p.reviewStatus === "pending") || [])
        .sort((a, b) => {
          // Sort by setId first (contains box number), then by page number
          // Handle legacy data that might have docId instead of setId
          const aSetId = a.setId || "";
          const bSetId = b.setId || "";
          const setCompare = aSetId.localeCompare(bSetId);
          if (setCompare !== 0) return setCompare;
          return a.pageNumber - b.pageNumber;
        });

      // Find first page that's not locked by someone else
      const availablePage = pendingPages.find(p => {
        // Not locked at all
        if (!p.lockedBy || !p.lockedAt) return true;
        // Locked by current user
        if (p.lockedBy === userId) return true;
        // Lock has expired (older than 5 minutes)
        const lockTime = new Date(p.lockedAt);
        return lockTime < lockExpiryTime;
      });

      if (availablePage) {
        const page = availablePage;

        // Lock the page for this user
        await client.models.Box2CloudPage.update({
          id: page.id,
          lockedBy: userId,
          lockedAt: now.toISOString(),
        });

        let boxInfo = {
          boxNumber: "",
          totalPages: 0,
          pagesReviewed: 0,
        };

        if (page.boxId) {
          const { data: box } = await client.models.Box2CloudBox.get({ id: page.boxId });
          if (box) {
            boxInfo = {
              boxNumber: box.boxNumber || "",
              totalPages: box.totalPages || 0,
              pagesReviewed: box.pagesReviewed || 0,
            };
          }
        }

        setCurrentPage({
          id: page.id,
          pageId: page.pageId,
          boxId: page.boxId || "",
          setId: page.setId || "",
          tenantId: page.tenantId || "",
          pageNumber: page.pageNumber,
          filename: page.filename,
          s3Key: page.s3Key,
          boxNumber: boxInfo.boxNumber,
          boxTotalPages: boxInfo.totalPages,
          boxPagesReviewed: boxInfo.pagesReviewed,
        });
        setQueueEmpty(false);
      } else {
        setCurrentPage(null);
        setQueueEmpty(true);
      }
    } catch (err) {
      console.error("Error fetching next page:", err);
      setError("Failed to load next page. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNextPage();
  }, [fetchNextPage]);

  const handleDecision = async (decision: ReviewDecision) => {
    if (!currentPage || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      // Get current user ID
      const session = await fetchAuthSession();
      const userId = session.tokens?.idToken?.payload?.sub as string || "unknown";

      // Update page status and clear lock
      await client.models.Box2CloudPage.update({
        id: currentPage.id,
        reviewStatus: decision,
        reviewedBy: userId,
        reviewedAt: new Date().toISOString(),
        lockedBy: null,
        lockedAt: null,
      });

      // Create user review record (audit trail)
      await client.models.Box2CloudUserReview.create({
        userId,
        tenantId: currentPage.tenantId,
        pageId: currentPage.pageId,
        boxNumber: currentPage.boxNumber || "",
        setId: currentPage.setId || "",
        pageNumber: currentPage.pageNumber,
        decision,
      });

      // Update box statistics
      if (currentPage.boxId) {
        const { data: box } = await client.models.Box2CloudBox.get({
          id: currentPage.boxId,
        });
        if (box) {
          const updateData: {
            id: string;
            pagesReviewed: number;
            pagesShred?: number;
            pagesUnsure?: number;
            pagesRetain?: number;
            status?: "pending" | "in_progress" | "complete";
          } = {
            id: box.id,
            pagesReviewed: (box.pagesReviewed || 0) + 1,
          };

          if (decision === "shred") {
            updateData.pagesShred = (box.pagesShred || 0) + 1;
          } else if (decision === "unsure") {
            updateData.pagesUnsure = (box.pagesUnsure || 0) + 1;
          } else if (decision === "retain") {
            updateData.pagesRetain = (box.pagesRetain || 0) + 1;
          }

          if (updateData.pagesReviewed === box.totalPages) {
            updateData.status = "complete";
          } else if (box.status === "pending") {
            updateData.status = "in_progress";
          }

          await client.models.Box2CloudBox.update(updateData);
        }
      }

      await fetchNextPage();
    } catch (err) {
      console.error("Error submitting review:", err);
      setError("Failed to submit review. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (submitting || loading || !currentPage) return;

      switch (e.key.toLowerCase()) {
        case "1":
        case "s":
          handleDecision("shred");
          break;
        case "2":
        case "u":
          handleDecision("unsure");
          break;
        case "3":
        case "r":
          handleDecision("retain");
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [submitting, loading, currentPage]);

  if (loading) {
    return (
      <div className="flex flex-col h-full flex-1">
        <div className="flex flex-col items-center justify-center flex-1 gap-4 text-gray-500 dark:text-gray-400">
          Loading next page...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col h-full flex-1">
        <div className="flex flex-col items-center justify-center flex-1 gap-4 text-red-600 dark:text-red-400">
          <p>{error}</p>
          <button
            onClick={fetchNextPage}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (queueEmpty) {
    return (
      <div className="flex flex-col h-full flex-1">
        <div className="flex flex-col items-center justify-center flex-1 gap-4 text-gray-500 dark:text-gray-400">
          <h2 className="text-gray-900 dark:text-gray-100 text-xl font-semibold mb-2">
            All Done!
          </h2>
          <p>There are no more pages to review.</p>
          <p>Check the Progress page to see the review summary.</p>
        </div>
      </div>
    );
  }

  if (!currentPage) {
    return (
      <div className="flex flex-col h-full flex-1">
        <div className="flex flex-col items-center justify-center flex-1 gap-4 text-gray-500 dark:text-gray-400">
          <p>No page available.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-1">
      {/* Left side - Image (maximum real estate) */}
      <div className="flex-1 flex items-center justify-center overflow-auto bg-gray-50 dark:bg-gray-900 p-4">
        <PageImage s3Key={currentPage.s3Key} filename={currentPage.filename} />
      </div>

      {/* Right side - Context and Controls */}
      <div className="w-80 flex flex-col border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <PageContext
          boxNumber={currentPage.boxNumber || ""}
          filename={currentPage.filename}
          pageNumber={currentPage.pageNumber}
          totalPages={currentPage.boxTotalPages || 0}
          pagesReviewed={currentPage.boxPagesReviewed || 0}
        />

        <div className="flex-1" />

        <DecisionButtons
          onDecision={handleDecision}
          disabled={submitting}
          loading={submitting}
        />
      </div>
    </div>
  );
}
