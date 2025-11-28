"use client";

import { AppLayout } from "@/app/components";
import { AdminPage } from "../components/AdminPage";

export default function Admin() {
  return (
    <AppLayout activePage="admin">
      <AdminPage />
    </AppLayout>
  );
}
