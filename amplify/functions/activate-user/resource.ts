import { defineFunction } from "@aws-amplify/backend";

export const activateUser = defineFunction({
  name: "activate-user",
  entry: "./handler.ts",
});
