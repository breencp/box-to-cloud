import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource.js';
import { data } from './data/resource.js';
import { storage } from './storage/resource.js';

const backend = defineBackend({
  auth,
  data,
  storage,
});

// Disable self-registration - only admins can create users
// This requires accessing the underlying CDK construct
const { cfnUserPool } = backend.auth.resources.cfnResources;
cfnUserPool.adminCreateUserConfig = {
  allowAdminCreateUserOnly: true,
};

// Grant the getPageImageUrl Lambda function read access to the S3 bucket
// and provide the bucket name as an environment variable
const getPageImageUrlLambda = backend.data.resources.functions["getPageImageUrl"];
if (getPageImageUrlLambda) {
  backend.storage.resources.bucket.grantRead(getPageImageUrlLambda);
  getPageImageUrlLambda.addEnvironment(
    "BUCKET_NAME",
    backend.storage.resources.bucket.bucketName
  );
}
