"use client";

import { Authenticator } from "@aws-amplify/ui-react";
import "@aws-amplify/ui-react/styles.css";
import { AuthProvider, useAuth } from "../contexts/AuthContext";

interface AppLayoutProps {
  children: React.ReactNode;
  activePage: "review" | "progress" | "boxes" | "admin";
}

function PendingApprovalScreen({ signOut, user }: { signOut?: () => void; user: { email?: string; fullName?: string } | null }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
      <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
        <div className="text-center mb-6">
          <div className="mx-auto w-16 h-16 bg-yellow-100 dark:bg-yellow-900 rounded-full flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-yellow-600 dark:text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            Account Pending Approval
          </h1>
        </div>

        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-6">
          <p className="text-sm text-yellow-700 dark:text-yellow-300">
            Your account has been created but is awaiting administrator approval.
            You will be able to access Box to Cloud once an admin has reviewed your
            account and granted you access to your organization.
          </p>
        </div>

        <div className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          <p className="mb-2">Signed in as:</p>
          <p className="font-medium text-gray-900 dark:text-gray-100">
            {user?.fullName || user?.email || "Unknown"}
          </p>
        </div>

        <button
          onClick={signOut}
          className="w-full px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}

function AppContent({ children, activePage, signOut }: AppLayoutProps & { signOut?: () => void }) {
  const { user, tenants, currentTenant, setCurrentTenant, canReview, isAdmin, isLoading } = useAuth();

  const navLinkClass = (page: string) =>
    `text-sm font-medium no-underline py-2 border-b-2 transition-colors ${
      activePage === page
        ? "text-blue-600 dark:text-blue-400 border-blue-600 dark:border-blue-400"
        : "text-gray-500 dark:text-gray-400 border-transparent hover:text-gray-900 dark:hover:text-gray-100"
    }`;

  // Show pending approval screen if user has no tenants and is not an admin
  if (!isLoading && !isAdmin && tenants.length === 0) {
    return <PendingApprovalScreen signOut={signOut} user={user} />;
  }

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
      hideSignUp={true}
      components={{
        Header() {
          return (
            <div className="mb-8 text-center">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                Box to Cloud
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                Sign in to your account
              </p>
            </div>
          );
        },
      }}
      className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 p-4"
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
