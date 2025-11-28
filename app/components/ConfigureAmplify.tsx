"use client";

import { useEffect } from "react";
import { Amplify } from "aws-amplify";
import outputs from "@/amplify_outputs.json";

// Configure on module load for client-side
if (typeof window !== "undefined") {
  Amplify.configure(outputs, { ssr: true });
}

export default function ConfigureAmplify() {
  useEffect(() => {
    // Ensure configuration on mount
    Amplify.configure(outputs, { ssr: true });
  }, []);

  return null;
}
