"use client";

import { useState, useEffect } from "react";
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";
import { useAuth } from "../contexts/AuthContext";

const client = generateClient<Schema>();

type Tab = "tenants" | "users";

interface Tenant {
  id: string;
  name: string;
  groupId: string;
  address?: string;
  isActive: boolean;
}

interface User {
  id: string;
  cognitoId?: string;
  email: string;
  fullName: string;
  title?: string;
  status: string;
  tenants: { tenantId: string; tenantName: string; role: string }[];
}

export function AdminPage() {
  const { isAdmin, isLoading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("tenants");
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal states
  const [showTenantModal, setShowTenantModal] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);

  // Form states
  const [tenantForm, setTenantForm] = useState({ name: "", groupId: "", address: "" });
  const [userForm, setUserForm] = useState({
    email: "",
    fullName: "",
    tenantId: "",
    role: "viewer" as "viewer" | "reviewer",
    title: "" as "" | "president" | "vice_president" | "secretary" | "treasurer" | "director",
  });

  // Success message state
  const [successMessage, setSuccessMessage] = useState<{
    email: string;
    tenantName: string;
    role: string;
    groupName: string;
  } | null>(null);

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
          cognitoId: u.cognitoId || undefined,
          email: u.email,
          fullName: u.fullName,
          title: u.title || undefined,
          status: u.status,
          tenants: userTenants,
        };
      });
      setUsers(userList);
    } catch (err) {
      console.error("Error loading admin data:", err);
      setError("Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  function getTenantGroupForRole(groupId: string, role: string): string {
    return `tenant_${groupId}_${role}`;
  }

  async function handleCreateTenant() {
    if (!tenantForm.name.trim() || !tenantForm.groupId.trim()) return;

    try {
      await client.models.Box2CloudTenant.create({
        name: tenantForm.name.trim(),
        groupId: tenantForm.groupId.trim().toLowerCase(),
        address: tenantForm.address.trim() || undefined,
        isActive: true,
      });

      setShowTenantModal(false);
      setTenantForm({ name: "", groupId: "", address: "" });
      await loadData();
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
      await loadData();
    } catch (err) {
      console.error("Error updating tenant:", err);
      setError("Failed to update tenant");
    }
  }

  async function handleCreateUser() {
    if (!userForm.email.trim() || !userForm.fullName.trim() || !userForm.tenantId) return;

    try {
      // Create the user with pending status
      const { data: newUser } = await client.models.Box2CloudUser.create({
        email: userForm.email.trim().toLowerCase(),
        fullName: userForm.fullName.trim(),
        title: userForm.title || undefined,
        status: "pending",
      });

      if (!newUser) {
        setError("Failed to create user");
        return;
      }

      // Create the user-tenant association
      await client.models.Box2CloudUserTenant.create({
        userId: newUser.id,
        tenantId: userForm.tenantId,
        role: userForm.role,
        isActive: true,
      });

      // Get tenant info for success message
      const tenant = tenants.find((t) => t.id === userForm.tenantId);
      const groupName = getTenantGroupForRole(tenant?.groupId || "", userForm.role);

      setSuccessMessage({
        email: userForm.email.trim().toLowerCase(),
        tenantName: tenant?.name || "Unknown",
        role: userForm.role,
        groupName,
      });

      setShowUserModal(false);
      setUserForm({ email: "", fullName: "", tenantId: "", role: "viewer", title: "" });
      await loadData();
    } catch (err) {
      console.error("Error creating user:", err);
      setError("Failed to create user");
    }
  }

  async function handleDisableUser(userId: string) {
    if (!confirm("Are you sure you want to disable this user?")) return;

    try {
      await client.models.Box2CloudUser.update({
        id: userId,
        status: "disabled",
      });
      await loadData();
    } catch (err) {
      console.error("Error disabling user:", err);
      setError("Failed to disable user");
    }
  }

  const tabClass = (tab: Tab) =>
    `px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
      activeTab === tab
        ? "text-blue-600 border-blue-600 bg-white dark:bg-gray-800"
        : "text-gray-500 border-transparent hover:text-gray-700"
    }`;

  const statusBadge = (status: string) => {
    const styles = {
      pending: "bg-yellow-100 text-yellow-700",
      active: "bg-green-100 text-green-700",
      disabled: "bg-gray-100 text-gray-500",
    };
    return styles[status as keyof typeof styles] || styles.pending;
  };

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

  const pendingUsers = users.filter((u) => u.status === "pending");

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
          {pendingUsers.length > 0 && (
            <span className="ml-2 px-1.5 py-0.5 text-xs bg-yellow-100 text-yellow-700 rounded">
              {pendingUsers.length} pending
            </span>
          )}
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
                          Group ID
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
                          <td className="px-4 py-3 font-mono text-sm text-gray-500">
                            {tenant.groupId}
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
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                  Users
                </h3>
                <button
                  onClick={() => {
                    setUserForm({ email: "", fullName: "", tenantId: "", role: "viewer", title: "" });
                    setShowUserModal(true);
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  disabled={tenants.length === 0}
                >
                  Invite User
                </button>
              </div>
              {tenants.length === 0 && (
                <div className="mb-4 p-4 bg-yellow-100 text-yellow-700 rounded-lg">
                  Create a tenant first before inviting users.
                </div>
              )}
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
                          Status
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">
                          Tenants
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((u) => (
                        <tr
                          key={u.id}
                          className="border-t border-gray-200 dark:border-gray-700"
                        >
                          <td className="px-4 py-3 text-gray-900 dark:text-gray-100">
                            {u.fullName}
                          </td>
                          <td className="px-4 py-3 text-gray-500">{u.email}</td>
                          <td className="px-4 py-3 text-gray-500 capitalize">
                            {u.title?.replace("_", " ") || "-"}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-xs px-2 py-1 rounded ${statusBadge(u.status)}`}>
                              {u.status}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {u.tenants.length === 0 ? (
                              <span className="text-gray-400">None</span>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {u.tenants.map((t) => (
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
                          <td className="px-4 py-3 text-right">
                            {u.status !== "disabled" && (
                              <button
                                onClick={() => handleDisableUser(u.id)}
                                className="text-red-600 hover:text-red-800 text-sm"
                              >
                                Disable
                              </button>
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

      {/* User/Invite Modal */}
      {showUserModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Invite User
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Email *
                </label>
                <input
                  type="email"
                  value={userForm.email}
                  onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  placeholder="user@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  value={userForm.fullName}
                  onChange={(e) => setUserForm({ ...userForm, fullName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  placeholder="John Doe"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Tenant *
                </label>
                <select
                  value={userForm.tenantId}
                  onChange={(e) => setUserForm({ ...userForm, tenantId: e.target.value })}
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
                  value={userForm.role}
                  onChange={(e) =>
                    setUserForm({
                      ...userForm,
                      role: e.target.value as "viewer" | "reviewer",
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                  <option value="viewer">Viewer (read-only)</option>
                  <option value="reviewer">Reviewer (can review pages)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Title
                </label>
                <select
                  value={userForm.title}
                  onChange={(e) =>
                    setUserForm({
                      ...userForm,
                      title: e.target.value as typeof userForm.title,
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
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowUserModal(false)}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateUser}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                disabled={!userForm.email || !userForm.fullName || !userForm.tenantId}
              >
                Create Invite
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Message Modal */}
      {successMessage && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-lg">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              User Invited Successfully
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              The user has been created with pending status. They can now sign up at your app&apos;s login page.
            </p>

            <div className="space-y-3 mb-4">
              <div>
                <span className="text-sm text-gray-500 dark:text-gray-400">Email:</span>
                <span className="ml-2 font-mono text-gray-900 dark:text-gray-100">
                  {successMessage.email}
                </span>
              </div>
              <div>
                <span className="text-sm text-gray-500 dark:text-gray-400">Tenant:</span>
                <span className="ml-2 text-gray-900 dark:text-gray-100">
                  {successMessage.tenantName}
                </span>
              </div>
              <div>
                <span className="text-sm text-gray-500 dark:text-gray-400">Role:</span>
                <span className="ml-2 text-gray-900 dark:text-gray-100 capitalize">
                  {successMessage.role}
                </span>
              </div>
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 mb-4">
              <p className="text-sm text-blue-800 dark:text-blue-200 mb-2">
                <strong>Next steps:</strong>
              </p>
              <ol className="text-sm text-blue-700 dark:text-blue-300 list-decimal list-inside space-y-1">
                <li>Send the user a link to your app&apos;s sign-up page</li>
                <li>They will create their account and set up MFA</li>
                <li>You&apos;ll receive an email notification when they sign up</li>
                <li>Add them to the Cognito group: <code className="font-mono bg-blue-100 dark:bg-blue-800 px-1 rounded">{successMessage.groupName}</code></li>
              </ol>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setSuccessMessage(null)}
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
