import type { AppSyncResolverHandler } from "aws-lambda";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3Client = new S3Client({});
const BUCKET_NAME = process.env.BUCKET_NAME!;
const URL_EXPIRATION_SECONDS = 300; // 5 minutes

interface GetPageImageUrlArgs {
  s3Key: string;
  tenantId: string;
}

interface GetPageImageUrlResult {
  url: string | null;
  error: string | null;
}

export const handler: AppSyncResolverHandler<
  GetPageImageUrlArgs,
  GetPageImageUrlResult
> = async (event) => {
  const { s3Key, tenantId } = event.arguments;
  const userGroups: string[] = event.identity?.claims?.["cognito:groups"] || [];

  // Check if user is admin (admins can access everything)
  const isAdmin = userGroups.includes("admin");

  // Check if user belongs to a tenant group that matches the requested tenant
  // Tenant groups are named: tenant_{tenantId}_viewer or tenant_{tenantId}_reviewer
  const hasTenantAccess = userGroups.some(
    (group) =>
      group === `tenant_${tenantId}_viewer` ||
      group === `tenant_${tenantId}_reviewer`
  );

  if (!isAdmin && !hasTenantAccess) {
    return {
      url: null,
      error: "Access denied: You do not have permission to view this image",
    };
  }

  // Verify the s3Key matches the tenantId (defense in depth)
  // Expected format: {tenantId}/{box}/{set}/page_xxxx.png
  if (!s3Key.startsWith(`${tenantId}/`)) {
    return {
      url: null,
      error: "Access denied: S3 key does not match tenant",
    };
  }

  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
    });

    const url = await getSignedUrl(s3Client, command, {
      expiresIn: URL_EXPIRATION_SECONDS,
    });

    return { url, error: null };
  } catch (error) {
    console.error("Error generating pre-signed URL:", error);
    return {
      url: null,
      error: "Failed to generate image URL",
    };
  }
};
