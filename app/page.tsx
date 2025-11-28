"use client";

import { AppLayout, ReviewPage } from "@/app/components";

export default function Home() {
  return (
    <AppLayout activePage="review">
      <ReviewPage />
    </AppLayout>
  );
}
