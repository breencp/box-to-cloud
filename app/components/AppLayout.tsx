"use client";

import { Authenticator } from "@aws-amplify/ui-react";
import "@aws-amplify/ui-react/styles.css";
import { AuthProvider, useAuth } from "../contexts/AuthContext";

interface AppLayoutProps {
  children: React.ReactNode;
  activePage: "review" | "progress" | "boxes" | "admin";
}

function AppContent({ children, activePage, signOut }: AppLayoutProps & { signOut?: () => void }) {
  const { user, tenants, currentTenant, setCurrentTenant, canReview, isAdmin } = useAuth();

  const navLinkClass = (page: string) =>
    `text-sm font-medium no-underline py-2 border-b-2 transition-colors ${
      activePage === page
        ? "text-blue-600 dark:text-blue-400 border-blue-600 dark:border-blue-400"
        : "text-gray-500 dark:text-gray-400 border-transparent hover:text-gray-900 dark:hover:text-gray-100"
    }`;

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="flex justify-between items-center px-8 py-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-50 max-md:flex-col max-md:gap-4 max-md:px-4">
        <div className="flex items-baseline gap-4 max-md:flex-col max-md:items-center max-md:gap-1">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 m-0">
            Box to Cloud
          </h1>
          {currentTenant && (
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {currentTenant.tenantName}
            </span>
          )}
        </div>
        <div className="flex items-center gap-8 max-md:flex-col max-md:gap-4 max-md:w-full">
          <nav className="flex gap-6 max-md:justify-center">
            {canReview && (
              <a href="/" className={navLinkClass("review")}>
                Review
              </a>
            )}
            <a href="/progress" className={navLinkClass("progress")}>
              Progress
            </a>
            <a href="/boxes" className={navLinkClass("boxes")}>
              Boxes
            </a>
            {isAdmin && (
              <a href="/admin" className={navLinkClass("admin")}>
                Admin
              </a>
            )}
          </nav>
          <div className="flex items-center gap-4 max-md:flex-col max-md:gap-2">
            {tenants.length > 1 && (
              <select
                value={currentTenant?.tenantId || ""}
                onChange={(e) => setCurrentTenant(e.target.value)}
                className="text-sm px-2 py-1 border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
              >
                {tenants.map((t) => (
                  <option key={t.tenantId} value={t.tenantId}>
                    {t.tenantName}
                  </option>
                ))}
              </select>
            )}
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {user?.fullName || user?.email}
            </span>
            <button
              onClick={signOut}
              className="px-4 py-2 text-sm bg-transparent text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>
      <main className="flex-1 flex flex-col">{children}</main>
    </div>
  );
}

export function AppLayout({ children, activePage }: AppLayoutProps) {
  return (
    <Authenticator
      className="min-h-screen flex items-center justify-center"
      hideSignUp={true}
    >
      {({ signOut }) => (
        <AuthProvider>
          <AppContent activePage={activePage} signOut={signOut}>
            {children}
          </AppContent>
        </AuthProvider>
      )}
    </Authenticator>
  );
}
