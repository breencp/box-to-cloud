import { defineFunction } from "@aws-amplify/backend";

export const postConfirmation = defineFunction({
  entry: "./handler.ts",
  resourceGroupName: "data", // Assigned to data stack because it accesses DynamoDB tables
});
