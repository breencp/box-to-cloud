"use client";

import { Amplify } from "aws-amplify";
import outputs from "@/amplify_outputs.json";
import { AppLayout } from "@/app/components";
import { BoxListPage } from "@/app/components";

Amplify.configure(outputs);

export default function Boxes() {
  return (
    <AppLayout activePage="boxes">
      <BoxListPage />
    </AppLayout>
  );
}
