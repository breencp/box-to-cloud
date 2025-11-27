import { type ClientSchema, a, defineData } from "@aws-amplify/backend";

/**
 * Box to Cloud - Document Retention Review Application
 *
 * Data schema for managing document page reviews.
 * All model names prefixed with "Box2Cloud" for easy identification in AWS Console.
 * See CLOUD_MIGRATION_SPEC.md for detailed entity definitions.
 */

const schema = a.schema({
  // Box entity - represents a physical box of scanned documents
  Box2CloudBox: a
    .model({
      boxNumber: a.string().required(),
      tenantId: a.string().required(),
      totalDocuments: a.integer().default(0),
      totalPages: a.integer().default(0),
      pagesReviewed: a.integer().default(0),
      pagesShred: a.integer().default(0),
      pagesUnsure: a.integer().default(0),
      pagesRetain: a.integer().default(0),
      status: a.enum(["pending", "in_progress", "complete"]),
    })
    .secondaryIndexes((index) => [
      index("tenantId").sortKeys(["boxNumber"]).name("byTenant"),
    ])
    .authorization((allow) => [allow.authenticated()]),

  // Document entity - represents a single PDF file within a box
  Box2CloudDocument: a
    .model({
      docId: a.string().required(),
      boxId: a.id().required(),
      tenantId: a.string().required(),
      filename: a.string().required(),
      pageCount: a.integer().default(0),
      pagesReviewed: a.integer().default(0),
    })
    .secondaryIndexes((index) => [
      index("boxId").sortKeys(["docId"]).name("byBox"),
      index("tenantId").name("byTenant"),
    ])
    .authorization((allow) => [allow.authenticated()]),

  // Page entity - represents a single page within a document (primary review entity)
  Box2CloudPage: a
    .model({
      pageId: a.string().required(),
      docId: a.string().required(),
      boxId: a.id().required(),
      tenantId: a.string().required(),
      pageNumber: a.integer().required(),
      filename: a.string().required(),
      s3Key: a.string().required(),
      reviewStatus: a.enum(["pending", "shred", "unsure", "retain"]),
      reviewedBy: a.string(),
      reviewedAt: a.datetime(),
      lockedBy: a.string(),
      lockedAt: a.datetime(),
    })
    .secondaryIndexes((index) => [
      index("boxId").sortKeys(["pageNumber"]).name("byBox"),
      index("tenantId")
        .sortKeys(["reviewStatus"])
        .name("byTenantAndStatus"),
    ])
    .authorization((allow) => [allow.authenticated()]),

  // UserReview entity - tracks what each user has reviewed (audit trail)
  Box2CloudUserReview: a
    .model({
      userId: a.string().required(),
      tenantId: a.string().required(),
      pageId: a.string().required(),
      boxNumber: a.string().required(),
      docId: a.string().required(),
      pageNumber: a.integer().required(),
      decision: a.enum(["shred", "unsure", "retain"]),
    })
    .secondaryIndexes((index) => [
      index("userId").name("byUser"),
      index("tenantId").name("byTenant"),
    ])
    .authorization((allow) => [allow.authenticated()]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: "userPool",
  },
});
