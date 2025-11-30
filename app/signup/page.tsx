"use client";

import { Authenticator } from "@aws-amplify/ui-react";
import "@aws-amplify/ui-react/styles.css";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { getCurrentUser } from "aws-amplify/auth";

export default function SignupPage() {
  const router = useRouter();

  // Check if already authenticated and redirect to home
  useEffect(() => {
    getCurrentUser()
      .then(() => {
        router.push("/");
      })
      .catch(() => {
        // Not authenticated, stay on signup page
      });
  }, [router]);

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
          // User has successfully signed up and confirmed - redirect to home
          router.push("/");
          return (
            <div className="text-center p-8">
              <p className="text-gray-600 dark:text-gray-400">
                Account created successfully! Redirecting...
              </p>
            </div>
          );
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
