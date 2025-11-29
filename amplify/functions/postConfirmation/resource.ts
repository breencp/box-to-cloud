import { defineFunction } from "@aws-amplify/backend";

export const postConfirmation = defineFunction({
  entry: "./handler.ts",
  resourceGroupName: "auth", // Auth trigger must be in auth stack
});
