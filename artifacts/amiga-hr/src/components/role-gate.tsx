import { type ReactNode } from "react";
import { Redirect } from "wouter";
import { Loader2 } from "lucide-react";
import {
  CurrentUserProvider,
  useCurrentUser,
  homePathForRole,
} from "@/hooks/use-current-user";
import type { CurrentUserRole } from "@workspace/api-client-react";

function FullScreenSpinner() {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-[#F8F7F4]">
      <Loader2 className="h-8 w-8 animate-spin text-[#C5A059]" />
    </div>
  );
}

/**
 * Loads the current app user (role + employee link) for all signed-in routes.
 * Render this only inside a Clerk signed-in boundary.
 */
export function ProtectedShell({ children }: { children: ReactNode }) {
  return <CurrentUserProvider>{children}</CurrentUserProvider>;
}

/**
 * Gates a route by role. Must be rendered inside a ProtectedShell.
 * - while loading: spinner
 * - unlinked non-admin: redirect to /no-access
 * - role not permitted: redirect to that role's home
 */
export function RoleGate({
  allow,
  children,
}: {
  allow: CurrentUserRole[];
  children: ReactNode;
}) {
  const { isLoading, isError, role, linked, isAdmin } = useCurrentUser();

  if (isLoading) return <FullScreenSpinner />;
  if (isError || !role) return <Redirect to="/no-access" />;
  if (!linked && !isAdmin) return <Redirect to="/no-access" />;
  if (!allow.includes(role)) return <Redirect to={homePathForRole(role)} />;

  return <>{children}</>;
}

/** Sends a signed-in user to the right landing page for their role. */
export function RoleHomeRedirect() {
  const { isLoading, isError, role, linked, isAdmin } = useCurrentUser();

  if (isLoading) return <FullScreenSpinner />;
  if (isError || !role) return <Redirect to="/no-access" />;
  if (!linked && !isAdmin) return <Redirect to="/no-access" />;

  return <Redirect to={homePathForRole(role)} />;
}
