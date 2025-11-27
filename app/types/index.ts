/**
 * DocSense Cloud - TypeScript Type Definitions
 */

// Review decision types
export type ReviewDecision = "shred" | "unsure" | "retain";

// Box status types
export type BoxStatus = "pending" | "in_progress" | "complete";

// Box recommendation types
export type BoxRecommendation = "SHRED" | "RETAIN" | "REVIEW" | null;

// Page context for display
export interface PageContext {
  boxTotalPages: number;
  boxPagesReviewed: number;
  docPageCount: number;
  docCurrentPage: number;
}

// Page entity for review
export interface PageData {
  id: string;
  pageId: string;
  boxId: string;
  docId: string;
  pageNumber: number;
  filename: string;
  imageUrl: string;
  context: PageContext;
  lockExpiresAt: string;
}

// Queue response
export interface QueueNextResponse {
  page: PageData | null;
  lockExpiresAt: string;
}

// Box entity
export interface BoxData {
  id: string;
  boxNumber: string;
  tenantId: string;
  totalDocuments: number;
  totalPages: number;
  pagesReviewed: number;
  pagesShred: number;
  pagesUnsure: number;
  pagesRetain: number;
  status: BoxStatus;
  recommendation?: BoxRecommendation;
}

// Document entity
export interface DocumentData {
  id: string;
  docId: string;
  boxId: string;
  filename: string;
  pageCount: number;
  pagesReviewed: number;
}

// Progress breakdown
export interface ReviewBreakdown {
  shred: number;
  unsure: number;
  retain: number;
}

// Boxes summary
export interface BoxesSummary {
  total: number;
  complete: number;
  inProgress: number;
  pending: number;
}

// Overall progress response
export interface ProgressData {
  totalPages: number;
  pagesReviewed: number;
  pagesRemaining: number;
  percentComplete: number;
  breakdown: ReviewBreakdown;
  boxesSummary: BoxesSummary;
  boxes: BoxData[];
}

// User review history item
export interface UserReviewItem {
  id: string;
  pageId: string;
  boxNumber: string;
  pageNumber: number;
  decision: ReviewDecision;
  reviewedAt: string;
}

// User reviews response
export interface UserReviewsResponse {
  reviews: UserReviewItem[];
  totalCount: number;
  nextCursor?: string;
}
