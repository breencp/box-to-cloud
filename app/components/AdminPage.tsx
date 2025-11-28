"use client";

import { useState, useEffect } from "react";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";
import { useAuth } from "../contexts/AuthContext";

const client = generateClient<Schema>();

type Tab = "tenants" | "users" | "invites";

interface Tenant {
  id: string;
  name: string;
  groupId: string;
  address?: string;
  isActive: boolean;
}

interface User {
  id: string;
  email: string;
  fullName: string;
  title?: string;
  tenants: { tenantId: string; tenantName: string; role: string }[];
}

interface Invite {
  id: string;
  email: string;
  tenantId: string;
  tenantName: string;
  role: string;
  fullName?: string;
  status: string;
  expiresAt: string;
}

export function AdminPage() {
  const { user, isAdmin, isLoading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("tenants");
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal states
  const [showTenantModal, setShowTenantModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);

  // Form states
  const [tenantForm, setTenantForm] = useState({ name: "", groupId: "", address: "" });
  const [inviteForm, setInviteForm] = useState({
    email: "",
    tenantId: "",
    role: "viewer" as "viewer" | "reviewer" | "admin",
    fullName: "",
    title: "" as "" | "president" | "vice_president" | "secretary" | "treasurer" | "director" | "member",
  });

  useEffect(() => {
    if (!authLoading && isAdmin) {
      loadData();
    }
  }, [authLoading, isAdmin]);

  async function loadData() {
    setLoading(true);
    setError(null);

    try {
      // Check if models are available (schema may not be deployed yet)
      if (!client.models?.Box2CloudTenant) {
        setError("Database tables not yet deployed. Please deploy the backend first.");
        setLoading(false);
        return;
      }

      // Load tenants
      const { data: tenantData } = await client.models.Box2CloudTenant.list();
      const tenantList = (tenantData || []).map((t) => ({
        id: t.id,
        name: t.name,
        groupId: t.groupId,
        address: t.address || undefined,
        isActive: t.isActive ?? true,
      }));
      setTenants(tenantList);

      // Load users with their tenant memberships
      const { data: userData } = await client.models.Box2CloudUser.list();
      const { data: userTenantData } = await client.models.Box2CloudUserTenant.list();

      const userList: User[] = (userData || []).map((u) => {
        const userTenants = (userTenantData || [])
          .filter((ut) => ut.userId === u.id)
          .map((ut) => {
            const tenant = tenantList.find((t) => t.id === ut.tenantId);
            return {
              tenantId: ut.tenantId,
              tenantName: tenant?.name || "Unknown",
              role: ut.role,
            };
          });

        return {
          id: u.id,
          email: u.email,
          fullName: u.fullName,
          title: u.title || undefined,
          tenants: userTenants,
        };
      });
      setUsers(userList);

      // Load invites
      const { data: inviteData } = await client.models.Box2CloudInvite.list({
        filter: { status: { eq: "pending" } },
      });
      const inviteList: Invite[] = (inviteData || []).map((i) => {
        const tenant = tenantList.find((t) => t.id === i.tenantId);
        return {
          id: i.id,
          email: i.email,
          tenantId: i.tenantId,
          tenantName: tenant?.name || "Unknown",
          role: i.role,
          fullName: i.fullName || undefined,
          status: i.status || "pending",
          expiresAt: i.expiresAt,
        };
      });
      setInvites(inviteList);
    } catch (err) {
      console.error("Error loading admin data:", err);
      setError("Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  // State for showing group creation instructions
  const [newTenantGroups, setNewTenantGroups] = useState<{
    tenantId: string;
    tenantName: string;
    groups: string[];
  } | null>(null);

  // State for showing user creation instructions after invite
  const [newInviteInfo, setNewInviteInfo] = useState<{
    email: string;
    tenantName: string;
    role: string;
    groupName: string;
  } | null>(null);

  function getTenantGroupNames(tenantId: string): { name: string; field: string }[] {
    return [
      { name: `tenant_${tenantId}_viewer`, field: "tenantViewerGroup" },
      { name: `tenant_${tenantId}_reviewer`, field: "tenantReviewerGroup" },
    ];
  }

  function getTenantGroupForRole(groupId: string, role: string): string {
    // Map role to group - admin users use reviewer group for data access
    // (super admin access is via the 'admin' Cognito group)
    const groupRole = role === "admin" ? "reviewer" : role;
    return `tenant_${groupId}_${groupRole}`;
  }

  async function handleCreateTenant() {
    if (!tenantForm.name.trim() || !tenantForm.groupId.trim()) return;

    try {
      const result = await client.models.Box2CloudTenant.create({
        name: tenantForm.name.trim(),
        groupId: tenantForm.groupId.trim().toLowerCase(),
        address: tenantForm.address.trim() || undefined,
        isActive: true,
      });

      // Show the Cognito groups that need to be created
      if (result.data) {
        setNewTenantGroups({
          tenantId: result.data.id,
          tenantName: result.data.name,
          groups: getTenantGroupNames(result.data.groupId).map((g) => g.name),
        });
      }

      setShowTenantModal(false);
      setTenantForm({ name: "", groupId: "", address: "" });
      loadData();
    } catch (err) {
      console.error("Error creating tenant:", err);
      setError("Failed to create tenant");
    }
  }

  async function handleUpdateTenant() {
    if (!editingTenant || !tenantForm.name.trim()) return;

    try {
      await client.models.Box2CloudTenant.update({
        id: editingTenant.id,
        name: tenantForm.name.trim(),
        address: tenantForm.address.trim() || undefined,
      });
      setShowTenantModal(false);
      setEditingTenant(null);
      setTenantForm({ name: "", groupId: "", address: "" });
      loadData();
    } catch (err) {
      console.error("Error updating tenant:", err);
      setError("Failed to update tenant");
    }
  }

  async function handleCreateInvite() {
    if (!inviteForm.email.trim() || !inviteForm.tenantId) return;

    try {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 days from now

      await client.models.Box2CloudInvite.create({
        email: inviteForm.email.trim().toLowerCase(),
        tenantId: inviteForm.tenantId,
        role: inviteForm.role,
        fullName: inviteForm.fullName.trim() || undefined,
        title: inviteForm.title || undefined,
        invitedBy: user?.cognitoId || user?.email || "unknown",
        expiresAt: expiresAt.toISOString(),
        status: "pending",
      });

      // Get tenant name for display
      const tenant = tenants.find((t) => t.id === inviteForm.tenantId);
      const groupName = getTenantGroupForRole(tenant?.groupId || "", inviteForm.role);

      // Show user creation instructions
      setNewInviteInfo({
        email: inviteForm.email.trim().toLowerCase(),
        tenantName: tenant?.name || "Unknown",
        role: inviteForm.role,
        groupName,
      });

      setShowInviteModal(false);
      setInviteForm({ email: "", tenantId: "", role: "viewer", fullName: "", title: "" });
      loadData();
    } catch (err) {
      console.error("Error creating invite:", err);
      setError("Failed to create invite");
    }
  }

  async function handleRevokeInvite(inviteId: string) {
    if (!confirm("Are you sure you want to revoke this invite?")) return;

    try {
      await client.models.Box2CloudInvite.update({
        id: inviteId,
        status: "revoked",
      });
      loadData();
    } catch (err) {
      console.error("Error revoking invite:", err);
      setError("Failed to revoke invite");
    }
  }

  const tabClass = (tab: Tab) =>
    `px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
      activeTab === tab
        ? "text-blue-600 border-blue-600 bg-white dark:bg-gray-800"
        : "text-gray-500 border-transparent hover:text-gray-700"
    }`;

  if (authLoading) {
    return (
      <div className="max-w-6xl mx-auto p-8">
        <div className="flex justify-center py-16 text-gray-500">Loading...</div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="max-w-6xl mx-auto p-8">
        <div className="flex justify-center py-16 text-red-600">
          Access denied. Admin privileges required.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-8 max-md:p-4">
      <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-6">
        Administration
      </h2>

      {error && (
        <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-lg">{error}</div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-gray-200 dark:border-gray-700">
        <button className={tabClass("tenants")} onClick={() => setActiveTab("tenants")}>
          Tenants ({tenants.length})
        </button>
        <button className={tabClass("users")} onClick={() => setActiveTab("users")}>
          Users ({users.length})
        </button>
        <button className={tabClass("invites")} onClick={() => setActiveTab("invites")}>
          Invites ({invites.length})
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16 text-gray-500">Loading...</div>
      ) : (
        <>
          {/* Tenants Tab */}
          {activeTab === "tenants" && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                  Tenants (AOAOs)
                </h3>
                <button
                  onClick={() => {
                    setEditingTenant(null);
                    setTenantForm({ name: "", groupId: "", address: "" });
                    setShowTenantModal(true);
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Add Tenant
                </button>
              </div>
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                {tenants.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">No tenants yet</div>
                ) : (
                  <table className="w-full">
                    <thead className="bg-gray-50 dark:bg-gray-900">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                          Name
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                          Address
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                          Status
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {tenants.map((tenant) => (
                        <tr
                          key={tenant.id}
                          className="border-t border-gray-200 dark:border-gray-700"
                        >
                          <td className="px-4 py-3 text-gray-900 dark:text-gray-100">
                            {tenant.name}
                          </td>
                          <td className="px-4 py-3 text-gray-500">{tenant.address || "-"}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`text-xs px-2 py-1 rounded ${
                                tenant.isActive
                                  ? "bg-green-100 text-green-700"
                                  : "bg-gray-100 text-gray-500"
                              }`}
                            >
                              {tenant.isActive ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => {
                                setEditingTenant(tenant);
                                setTenantForm({ name: tenant.name, groupId: tenant.groupId, address: tenant.address || "" });
                                setShowTenantModal(true);
                              }}
                              className="text-blue-600 hover:text-blue-800 text-sm"
                            >
                              Edit
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* Users Tab */}
          {activeTab === "users" && (
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
                Users
              </h3>
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                {users.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">No users yet</div>
                ) : (
                  <table className="w-full">
                    <thead className="bg-gray-50 dark:bg-gray-900">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                          Name
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                          Email
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                          Title
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                          Tenants
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((user) => (
                        <tr
                          key={user.id}
                          className="border-t border-gray-200 dark:border-gray-700"
                        >
                          <td className="px-4 py-3 text-gray-900 dark:text-gray-100">
                            {user.fullName}
                          </td>
                          <td className="px-4 py-3 text-gray-500">{user.email}</td>
                          <td className="px-4 py-3 text-gray-500 capitalize">
                            {user.title?.replace("_", " ") || "-"}
                          </td>
                          <td className="px-4 py-3">
                            {user.tenants.length === 0 ? (
                              <span className="text-gray-400">None</span>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {user.tenants.map((t) => (
                                  <span
                                    key={t.tenantId}
                                    className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded"
                                  >
                                    {t.tenantName} ({t.role})
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* Invites Tab */}
          {activeTab === "invites" && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                  Pending Invites
                </h3>
                <button
                  onClick={() => {
                    setInviteForm({ email: "", tenantId: "", role: "viewer", fullName: "", title: "" });
                    setShowInviteModal(true);
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  disabled={tenants.length === 0}
                >
                  Send Invite
                </button>
              </div>
              {tenants.length === 0 && (
                <div className="mb-4 p-4 bg-yellow-100 text-yellow-700 rounded-lg">
                  Create a tenant first before sending invites.
                </div>
              )}
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                {invites.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">No pending invites</div>
                ) : (
                  <table className="w-full">
                    <thead className="bg-gray-50 dark:bg-gray-900">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                          Email
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                          Name
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                          Tenant
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                          Role
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                          Expires
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {invites.map((invite) => (
                        <tr
                          key={invite.id}
                          className="border-t border-gray-200 dark:border-gray-700"
                        >
                          <td className="px-4 py-3 text-gray-900 dark:text-gray-100">
                            {invite.email}
                          </td>
                          <td className="px-4 py-3 text-gray-500">{invite.fullName || "-"}</td>
                          <td className="px-4 py-3 text-gray-500">{invite.tenantName}</td>
                          <td className="px-4 py-3 text-gray-500 capitalize">{invite.role}</td>
                          <td className="px-4 py-3 text-gray-500">
                            {new Date(invite.expiresAt).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => handleRevokeInvite(invite.id)}
                              className="text-red-600 hover:text-red-800 text-sm"
                            >
                              Revoke
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Tenant Modal */}
      {showTenantModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              {editingTenant ? "Edit Tenant" : "Add Tenant"}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  value={tenantForm.name}
                  onChange={(e) => setTenantForm({ ...tenantForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  placeholder="Waikiki Townhouse"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Group ID * {!editingTenant && <span className="font-normal text-gray-500">(used in Cognito groups)</span>}
                </label>
                <input
                  type="text"
                  value={tenantForm.groupId}
                  onChange={(e) => setTenantForm({ ...tenantForm, groupId: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  placeholder="wth"
                  disabled={!!editingTenant}
                />
                {!editingTenant && tenantForm.groupId && (
                  <p className="mt-1 text-xs text-gray-500">
                    Groups: tenant_{tenantForm.groupId}_viewer, tenant_{tenantForm.groupId}_reviewer
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Address
                </label>
                <input
                  type="text"
                  value={tenantForm.address}
                  onChange={(e) => setTenantForm({ ...tenantForm, address: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  placeholder="Building Address"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowTenantModal(false)}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={editingTenant ? handleUpdateTenant : handleCreateTenant}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                {editingTenant ? "Update" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Send Invite
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Email *
                </label>
                <input
                  type="email"
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  placeholder="user@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  value={inviteForm.fullName}
                  onChange={(e) => setInviteForm({ ...inviteForm, fullName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  placeholder="John Doe"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Tenant *
                </label>
                <select
                  value={inviteForm.tenantId}
                  onChange={(e) => setInviteForm({ ...inviteForm, tenantId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                  <option value="">Select tenant...</option>
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Role *
                </label>
                <select
                  value={inviteForm.role}
                  onChange={(e) =>
                    setInviteForm({
                      ...inviteForm,
                      role: e.target.value as "viewer" | "reviewer" | "admin",
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                  <option value="viewer">Viewer (read-only)</option>
                  <option value="reviewer">Reviewer (can review pages)</option>
                  <option value="admin">Admin (can manage tenant)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Title
                </label>
                <select
                  value={inviteForm.title}
                  onChange={(e) =>
                    setInviteForm({
                      ...inviteForm,
                      title: e.target.value as typeof inviteForm.title,
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                  <option value="">None</option>
                  <option value="president">President</option>
                  <option value="vice_president">Vice President</option>
                  <option value="secretary">Secretary</option>
                  <option value="treasurer">Treasurer</option>
                  <option value="director">Director</option>
                  <option value="member">Member</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowInviteModal(false)}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateInvite}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                disabled={!inviteForm.email || !inviteForm.tenantId}
              >
                Send Invite
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Group Creation Instructions Modal */}
      {newTenantGroups && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-lg">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Tenant Created Successfully
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Create the following Cognito groups for <strong>{newTenantGroups.tenantName}</strong>:
            </p>
            <div className="bg-gray-100 dark:bg-gray-900 rounded-lg p-4 mb-4 font-mono text-sm overflow-x-auto">
              {newTenantGroups.groups.map((group) => (
                <div key={group} className="text-gray-800 dark:text-gray-200">
                  {group}
                </div>
              ))}
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Run these AWS CLI commands to create the groups:
            </p>
            <div className="bg-gray-900 rounded-lg p-4 mb-4 font-mono text-xs text-green-400 overflow-x-auto">
              <pre>{`# Replace USER_POOL_ID with your Cognito User Pool ID
${newTenantGroups.groups.map((g) => `aws cognito-idp create-group --user-pool-id USER_POOL_ID --group-name "${g}"`).join("\n")}`}</pre>
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setNewTenantGroups(null)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* User Creation Instructions Modal */}
      {newInviteInfo && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-lg">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Invite Created Successfully
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Now create the Cognito user and add them to the group:
            </p>

            <div className="space-y-3 mb-4">
              <div>
                <span className="text-sm text-gray-500 dark:text-gray-400">Email:</span>
                <span className="ml-2 font-mono text-gray-900 dark:text-gray-100">
                  {newInviteInfo.email}
                </span>
              </div>
              <div>
                <span className="text-sm text-gray-500 dark:text-gray-400">Tenant:</span>
                <span className="ml-2 text-gray-900 dark:text-gray-100">
                  {newInviteInfo.tenantName}
                </span>
              </div>
              <div>
                <span className="text-sm text-gray-500 dark:text-gray-400">Role:</span>
                <span className="ml-2 text-gray-900 dark:text-gray-100 capitalize">
                  {newInviteInfo.role}
                </span>
              </div>
              <div>
                <span className="text-sm text-gray-500 dark:text-gray-400">Group:</span>
                <span className="ml-2 font-mono text-gray-900 dark:text-gray-100">
                  {newInviteInfo.groupName}
                </span>
              </div>
            </div>

            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Run these AWS CLI commands:
            </p>
            <div className="bg-gray-900 rounded-lg p-4 mb-4 font-mono text-xs text-green-400 overflow-x-auto">
              <pre>{`# Replace USER_POOL_ID with your Cognito User Pool ID

# 1. Create the user (they will receive an email with temporary password)
aws cognito-idp admin-create-user \\
  --user-pool-id USER_POOL_ID \\
  --username "${newInviteInfo.email}" \\
  --user-attributes Name=email,Value="${newInviteInfo.email}" Name=email_verified,Value=true \\
  --desired-delivery-mediums EMAIL

# 2. Add user to the tenant group
aws cognito-idp admin-add-user-to-group \\
  --user-pool-id USER_POOL_ID \\
  --username "${newInviteInfo.email}" \\
  --group-name "${newInviteInfo.groupName}"`}</pre>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
              Note: You can also create users via the AWS Console under Cognito &gt; User pools &gt; Users.
            </p>
            <div className="flex justify-end">
              <button
                onClick={() => setNewInviteInfo(null)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
