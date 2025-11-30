"use client";

import { Authenticator } from "@aws-amplify/ui-react";
import "@aws-amplify/ui-react/styles.css";
import { useState } from "react";
import { signOut } from "aws-amplify/auth";

export default function SignupPage() {
  const [signupComplete, setSignupComplete] = useState(false);

  if (signupComplete) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
          <div className="text-center mb-6">
            <div className="mx-auto w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              Account Created!
            </h1>
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
            <h2 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">
              Pending Admin Review
            </h2>
            <p className="text-sm text-blue-700 dark:text-blue-300">
              Your account has been created successfully. An administrator has been notified
              and will review your account shortly. You will receive access once your account
              has been approved and assigned to the appropriate tenant.
            </p>
          </div>

          <div className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
            <p><strong>What happens next?</strong></p>
            <ol className="list-decimal list-inside space-y-2">
              <li>An admin will verify your invitation</li>
              <li>Your account will be linked to your organization</li>
              <li>You&apos;ll be granted the appropriate access level</li>
              <li>You can then sign in and start using Box to Cloud</li>
            </ol>
          </div>

          <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={() => signOut()}
              className="w-full px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              Return to Sign In
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          Box to Cloud
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Create your account to get started
        </p>
      </div>

      <Authenticator
        initialState="signUp"
        className="flex items-center justify-center"
      >
        {() => {
          // User has successfully signed up - show pending message
          setSignupComplete(true);
          return <></>;
        }}
      </Authenticator>

      <div className="mt-8 text-center">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Already have an account?{" "}
          <a href="/" className="text-blue-600 hover:text-blue-800 dark:text-blue-400">
            Sign in
          </a>
        </p>
      </div>
    </div>
  );
}
