"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { generateClient } from "aws-amplify/data";
import { fetchAuthSession, fetchUserAttributes } from "aws-amplify/auth";
import type { Schema } from "@/amplify/data/resource";

const client = generateClient<Schema>();

export type TenantRole = "viewer" | "reviewer" | "admin";

export interface UserTenant {
  tenantId: string;
  tenantName: string;
  role: TenantRole;
}

export interface UserProfile {
  id: string;
  cognitoId: string;
  email: string;
  fullName: string;
  title?: string;
}

interface AuthContextType {
  user: UserProfile | null;
  tenants: UserTenant[];
  currentTenant: UserTenant | null;
  isAdmin: boolean; // Cognito admin group
  isLoading: boolean;
  error: string | null;
  setCurrentTenant: (tenantId: string) => void;
  hasRole: (role: TenantRole) => boolean;
  canReview: boolean;
  canManageTenant: boolean;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [tenants, setTenants] = useState<UserTenant[]>([]);
  const [currentTenant, setCurrentTenantState] = useState<UserTenant | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadUserData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Get Cognito session and attributes
      const session = await fetchAuthSession();
      const cognitoId = session.tokens?.idToken?.payload?.sub as string;
      const groups = (session.tokens?.idToken?.payload?.["cognito:groups"] as string[]) || [];

      setIsAdmin(groups.includes("admin"));

      if (!cognitoId) {
        setError("Unable to get user ID");
        return;
      }

      // Get user attributes for email
      const attributes = await fetchUserAttributes();
      const email = attributes.email || "";

      // Check if the User model exists (tables may not be deployed yet)
      if (!client.models.Box2CloudUser) {
        // Tables not deployed yet - use basic auth info
        setUser({
          id: "",
          cognitoId,
          email,
          fullName: email,
        });
        setIsLoading(false);
        return;
      }

      // Look up user profile in our database
      let users;
      try {
        const result = await client.models.Box2CloudUser.list({
          filter: { cognitoId: { eq: cognitoId } },
        });
        users = result.data;
      } catch {
        // Table might not exist yet - use basic auth info
        setUser({
          id: "",
          cognitoId,
          email,
          fullName: email,
        });
        setIsLoading(false);
        return;
      }

      if (users && users.length > 0) {
        const dbUser = users[0];
        setUser({
          id: dbUser.id,
          cognitoId: dbUser.cognitoId,
          email: dbUser.email,
          fullName: dbUser.fullName,
          title: dbUser.title || undefined,
        });

        // Get user's tenant memberships
        try {
          const { data: userTenants } = await client.models.Box2CloudUserTenant.list({
            filter: { userId: { eq: dbUser.id }, isActive: { eq: true } },
          });

          if (userTenants && userTenants.length > 0) {
            // Fetch tenant names
            const tenantList: UserTenant[] = [];
            for (const ut of userTenants) {
              const { data: tenant } = await client.models.Box2CloudTenant.get({
                id: ut.tenantId,
              });
              if (tenant) {
                tenantList.push({
                  tenantId: ut.tenantId,
                  tenantName: tenant.name,
                  role: ut.role as TenantRole,
                });
              }
            }
            setTenants(tenantList);

            // Set current tenant from localStorage or first available
            const savedTenantId = localStorage.getItem("currentTenantId");
            const savedTenant = tenantList.find((t) => t.tenantId === savedTenantId);
            setCurrentTenantState(savedTenant || tenantList[0] || null);
          }
        } catch {
          // UserTenant table might not exist yet - continue without tenant data
          console.warn("Could not load tenant memberships");
        }
      } else {
        // User exists in Cognito but not in our database
        // This happens for newly invited users on first login
        // They need to complete their profile setup
        setUser({
          id: "",
          cognitoId,
          email,
          fullName: "",
        });
      }
    } catch (err) {
      console.error("Error loading user data:", err);
      setError("Failed to load user data");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUserData();
  }, [loadUserData]);

  const setCurrentTenant = useCallback((tenantId: string) => {
    const tenant = tenants.find((t) => t.tenantId === tenantId);
    if (tenant) {
      setCurrentTenantState(tenant);
      localStorage.setItem("currentTenantId", tenantId);
    }
  }, [tenants]);

  const hasRole = useCallback(
    (role: TenantRole): boolean => {
      if (isAdmin) return true; // Cognito admins have all roles
      if (!currentTenant) return false;

      const roleHierarchy: Record<TenantRole, number> = {
        viewer: 1,
        reviewer: 2,
        admin: 3,
      };

      return roleHierarchy[currentTenant.role] >= roleHierarchy[role];
    },
    [currentTenant, isAdmin]
  );

  const canReview = hasRole("reviewer");
  const canManageTenant = hasRole("admin");

  return (
    <AuthContext.Provider
      value={{
        user,
        tenants,
        currentTenant,
        isAdmin,
        isLoading,
        error,
        setCurrentTenant,
        hasRole,
        canReview,
        canManageTenant,
        refreshAuth: loadUserData,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
