"use client";

import { Amplify } from "aws-amplify";
import outputs from "@/amplify_outputs.json";
import { AppLayout } from "@/app/components";
import { AdminPage } from "../components/AdminPage";

Amplify.configure(outputs);

export default function Admin() {
  return (
    <AppLayout activePage="admin">
      <AdminPage />
    </AppLayout>
  );
}
