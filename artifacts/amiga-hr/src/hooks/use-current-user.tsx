import { createContext, useContext, type ReactNode } from "react";
import {
  useGetCurrentUser,
  getGetCurrentUserQueryKey,
  type CurrentUser,
  type CurrentUserRole,
} from "@workspace/api-client-react";

type CurrentUserContextValue = {
  user: CurrentUser | undefined;
  isLoading: boolean;
  isError: boolean;
  role: CurrentUserRole | undefined;
  isAdmin: boolean;
  isManager: boolean;
  isEmployee: boolean;
  linked: boolean;
  employeeId: number | null;
};

const CurrentUserContext = createContext<CurrentUserContextValue | undefined>(
  undefined,
);

export function CurrentUserProvider({ children }: { children: ReactNode }) {
  const { data, isLoading, isError } = useGetCurrentUser({
    query: { staleTime: 60_000, queryKey: getGetCurrentUserQueryKey() },
  });

  const value: CurrentUserContextValue = {
    user: data,
    isLoading,
    isError,
    role: data?.role,
    isAdmin: data?.role === "admin",
    isManager: data?.role === "manager",
    isEmployee: data?.role === "employee",
    linked: data?.linked ?? false,
    employeeId: data?.employeeId ?? null,
  };

  return (
    <CurrentUserContext.Provider value={value}>
      {children}
    </CurrentUserContext.Provider>
  );
}

export function useCurrentUser(): CurrentUserContextValue {
  const ctx = useContext(CurrentUserContext);
  if (!ctx) {
    throw new Error("useCurrentUser must be used within a CurrentUserProvider");
  }
  return ctx;
}

/** The landing route for a given role once signed in. */
export function homePathForRole(role: CurrentUserRole | undefined): string {
  switch (role) {
    case "admin":
      return "/dashboard";
    case "manager":
      return "/team-leave";
    case "employee":
      return "/my-leave";
    default:
      return "/no-access";
  }
}
