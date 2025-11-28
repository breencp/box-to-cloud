import { type ClientSchema, a, defineData } from "@aws-amplify/backend";

/**
 * Box to Cloud - Page Retention Review Application
 *
 * Data schema for managing page reviews with multi-tenant support.
 * All model names prefixed with "Box2Cloud" for easy identification in AWS Console.
 */

// Enum definitions
const UserTitle = a.enum([
  "president",
  "vice_president",
  "secretary",
  "treasurer",
  "director",
  "member",
]);

const UserTenantRole = a.enum(["viewer", "reviewer", "admin"]);

const InviteStatus = a.enum(["pending", "accepted", "expired", "revoked"]);

const schema = a.schema({
  // Expose enums in schema
  UserTitle,
  UserTenantRole,
  InviteStatus,

  // Tenant entity - represents an AOAO/building
  Box2CloudTenant: a
    .model({
      name: a.string().required(),
      address: a.string(),
      isActive: a.boolean().default(true),
    })
    .authorization((allow) => [
      allow.groups(["admin"]),
      allow.authenticated().to(["read"]),
    ]),

  // User entity - user profile information
  Box2CloudUser: a
    .model({
      cognitoId: a.string().required(),
      email: a.string().required(),
      fullName: a.string().required(),
      title: a.ref("UserTitle"),
    })
    .secondaryIndexes((index) => [
      index("cognitoId").name("byCognitoId"),
      index("email").name("byEmail"),
    ])
    .authorization((allow) => [
      allow.groups(["admin"]),
      allow.authenticated().to(["read"]),
    ]),

  // UserTenant entity - links users to tenants with roles
  Box2CloudUserTenant: a
    .model({
      userId: a.id().required(),
      tenantId: a.id().required(),
      role: a.ref("UserTenantRole").required(),
      isActive: a.boolean().default(true),
    })
    .secondaryIndexes((index) => [
      index("userId").name("byUser"),
      index("tenantId").name("byTenant"),
    ])
    .authorization((allow) => [
      allow.groups(["admin"]),
      allow.authenticated().to(["read"]),
    ]),

  // Invite entity - pending user invitations
  Box2CloudInvite: a
    .model({
      email: a.string().required(),
      tenantId: a.id().required(),
      role: a.ref("UserTenantRole").required(),
      fullName: a.string(),
      title: a.ref("UserTitle"),
      invitedBy: a.string().required(),
      expiresAt: a.datetime().required(),
      acceptedAt: a.datetime(),
      status: a.ref("InviteStatus"),
    })
    .secondaryIndexes((index) => [
      index("email").name("byEmail"),
      index("tenantId").name("byTenant"),
    ])
    .authorization((allow) => [
      allow.groups(["admin"]),
      allow.authenticated().to(["read"]),
    ]),

  // Box entity - represents a physical box of scanned documents
  // Authorization: tenant viewers can read, tenant reviewers can read/update
  Box2CloudBox: a
    .model({
      boxNumber: a.string().required(),
      tenantId: a.id().required(),
      totalSets: a.integer().default(0),
      totalPages: a.integer().default(0),
      pagesReviewed: a.integer().default(0),
      pagesShred: a.integer().default(0),
      pagesUnsure: a.integer().default(0),
      pagesRetain: a.integer().default(0),
      status: a.enum(["pending", "in_progress", "complete"]),
      // Groups that can access this record (set when creating: ["tenant_{id}_viewer", "tenant_{id}_reviewer", "tenant_{id}_admin"])
      viewerGroup: a.string(),
      reviewerGroup: a.string(),
      adminGroup: a.string(),
    })
    .secondaryIndexes((index) => [
      index("tenantId").sortKeys(["boxNumber"]).name("byTenant"),
    ])
    .authorization((allow) => [
      allow.groups(["admin"]), // Super admins
      allow.groupsDefinedIn("viewerGroup").to(["read"]),
      allow.groupsDefinedIn("reviewerGroup").to(["read", "update"]),
      allow.groupsDefinedIn("adminGroup"),
    ]),

  // Set entity - represents a batch of scanned pages (one PDF file)
  Box2CloudSet: a
    .model({
      setId: a.string().required(),
      boxId: a.id().required(),
      tenantId: a.string().required(),
      filename: a.string().required(),
      pageCount: a.integer().default(0),
      pagesReviewed: a.integer().default(0),
      viewerGroup: a.string(),
      reviewerGroup: a.string(),
      adminGroup: a.string(),
    })
    .secondaryIndexes((index) => [
      index("boxId").sortKeys(["setId"]).name("byBox"),
      index("tenantId").name("byTenant"),
    ])
    .authorization((allow) => [
      allow.groups(["admin"]),
      allow.groupsDefinedIn("viewerGroup").to(["read"]),
      allow.groupsDefinedIn("reviewerGroup").to(["read", "update"]),
      allow.groupsDefinedIn("adminGroup"),
    ]),

  // Page entity - represents a single page within a set (primary review entity)
  Box2CloudPage: a
    .model({
      pageId: a.string().required(),
      setId: a.string().required(),
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
      viewerGroup: a.string(),
      reviewerGroup: a.string(),
      adminGroup: a.string(),
    })
    .secondaryIndexes((index) => [
      index("boxId").sortKeys(["pageNumber"]).name("byBox"),
      index("tenantId")
        .sortKeys(["reviewStatus"])
        .name("byTenantAndStatus"),
    ])
    .authorization((allow) => [
      allow.groups(["admin"]),
      allow.groupsDefinedIn("viewerGroup").to(["read"]),
      allow.groupsDefinedIn("reviewerGroup").to(["read", "update"]),
      allow.groupsDefinedIn("adminGroup"),
    ]),

  // UserReview entity - tracks what each user has reviewed (audit trail)
  Box2CloudUserReview: a
    .model({
      userId: a.string().required(),
      tenantId: a.string().required(),
      pageId: a.string().required(),
      boxNumber: a.string().required(),
      setId: a.string().required(),
      pageNumber: a.integer().required(),
      decision: a.enum(["shred", "unsure", "retain"]),
      viewerGroup: a.string(),
      reviewerGroup: a.string(),
      adminGroup: a.string(),
    })
    .secondaryIndexes((index) => [
      index("userId").name("byUser"),
      index("tenantId").name("byTenant"),
    ])
    .authorization((allow) => [
      allow.groups(["admin"]),
      allow.groupsDefinedIn("viewerGroup").to(["read"]),
      allow.groupsDefinedIn("reviewerGroup").to(["read", "create"]),
      allow.groupsDefinedIn("adminGroup"),
    ]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: "userPool",
  },
});
