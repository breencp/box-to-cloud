"use client";

import { Amplify } from "aws-amplify";
import outputs from "@/amplify_outputs.json";
import { AppLayout } from "@/app/components";
import { ProgressPage } from "@/app/components";

Amplify.configure(outputs);

export default function Progress() {
  return (
    <AppLayout activePage="progress">
      <ProgressPage />
    </AppLayout>
  );
}
