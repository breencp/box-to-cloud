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
]);

const UserTenantRole = a.enum(["viewer", "reviewer"]);

const UserStatus = a.enum(["pending", "active", "disabled"]);

const schema = a.schema({
  // Expose enums in schema
  UserTitle,
  UserTenantRole,
  UserStatus,

  // Tenant entity - represents an AOAO/building
  Box2CloudTenant: a
    .model({
      name: a.string().required(),
      groupId: a.string().required(), // Used in Cognito group names: tenant_{groupId}_viewer
      address: a.string(),
      isActive: a.boolean().default(true),
    })
    .secondaryIndexes((index) => [
      index("groupId").name("byGroupId"),
    ])
    .authorization((allow) => [
      allow.groups(["admin"]),
      allow.authenticated().to(["read"]),
    ]),

  // User entity - user profile information
  // Users are created when invited (status: pending, cognitoId: null)
  // When they sign up via Cognito, cognitoId is linked and status becomes active
  Box2CloudUser: a
    .model({
      cognitoId: a.string(), // null until user signs up via Cognito
      email: a.string().required(),
      fullName: a.string().required(),
      title: a.ref("UserTitle"),
      status: a.ref("UserStatus").required(),
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

  // Box entity - represents a physical box of scanned documents
  // Authorization: admins have full access, tenant groups have read/update based on role
  Box2CloudBox: a
    .model({
      boxNumber: a.string().required(),
      tenantId: a.string().required(),
      // Groups field for dynamic authorization - stores array of group names that can access this record
      // e.g., ["tenant_wth_viewer", "tenant_wth_reviewer"]
      groups: a.string().array(),
      totalSets: a.integer().default(0),
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
    .authorization((allow) => [
      allow.groups(["admin"]), // Super admins - full access
      allow.groupsDefinedIn("groups"), // Dynamic group auth - users in any group listed in the 'groups' field
    ]),

  // Set entity - represents a batch of scanned pages (one PDF file)
  Box2CloudSet: a
    .model({
      setId: a.string().required(),
      boxId: a.string().required(),
      tenantId: a.string().required(),
      groups: a.string().array(), // Dynamic authorization groups
      filename: a.string().required(),
      pageCount: a.integer().default(0),
      pagesReviewed: a.integer().default(0),
    })
    .secondaryIndexes((index) => [
      index("boxId").sortKeys(["setId"]).name("byBox"),
      index("tenantId").name("byTenant"),
    ])
    .authorization((allow) => [
      allow.groups(["admin"]),
      allow.groupsDefinedIn("groups"),
    ]),

  // Page entity - represents a single page within a set (primary review entity)
  Box2CloudPage: a
    .model({
      pageId: a.string().required(),
      setId: a.string().required(),
      boxId: a.string().required(),
      tenantId: a.string().required(),
      groups: a.string().array(), // Dynamic authorization groups
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
    .authorization((allow) => [
      allow.groups(["admin"]),
      allow.groupsDefinedIn("groups"),
    ]),

  // UserReview entity - tracks what each user has reviewed (audit trail)
  Box2CloudUserReview: a
    .model({
      userId: a.string().required(),
      tenantId: a.string().required(),
      groups: a.string().array(), // Dynamic authorization groups
      pageId: a.string().required(),
      boxNumber: a.string().required(),
      setId: a.string().required(),
      pageNumber: a.integer().required(),
      decision: a.enum(["shred", "unsure", "retain"]),
    })
    .secondaryIndexes((index) => [
      index("userId").name("byUser"),
      index("tenantId").name("byTenant"),
    ])
    .authorization((allow) => [
      allow.groups(["admin"]),
      allow.groupsDefinedIn("groups"),
    ]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: "userPool",
  },
});
