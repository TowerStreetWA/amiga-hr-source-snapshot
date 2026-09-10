import { useEffect, useRef, type ReactNode } from "react";
import {
  Switch,
  Route,
  Redirect,
  useLocation,
  Router as WouterRouter,
} from "wouter";
import {
  ClerkProvider,
  SignIn,
  SignUp,
  Show,
  useClerk,
} from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Layout } from "@/components/layout";
import { Landing } from "@/pages/landing";
import { Dashboard } from "@/pages/dashboard";
import { Employees } from "@/pages/employees";
import { EmployeeDetail } from "@/pages/employee-detail";
import { Recruitment } from "@/pages/recruitment";
import { CandidateDetail } from "@/pages/candidate-detail";
import { Onboarding } from "@/pages/onboarding";
import { Training } from "@/pages/training";
import { Leave } from "@/pages/leave";
import { Sickness } from "@/pages/sickness";
import { Pay } from "@/pages/pay";
import { Benefits } from "@/pages/benefits";
import { ImportPage } from "@/pages/import";
import { Settings as SettingsPage } from "@/pages/settings";
import { Apply } from "@/pages/apply";
import { CandidateOnboarding } from "@/pages/candidate-onboarding";
import { NoAccess } from "@/pages/no-access";
import { MyLeave } from "@/pages/my-leave";
import { MyProfile } from "@/pages/my-profile";
import { TeamLeave } from "@/pages/team-leave";
import { TeamSickness } from "@/pages/team-sickness";
import { TeamPay } from "@/pages/team-pay";
import { TeamRecruitment } from "@/pages/team-recruitment";
import { AdminUsers } from "@/pages/admin-users";
import { CleanupHealth } from "@/pages/cleanup-health";
import { ProtectedShell, RoleGate, RoleHomeRedirect } from "@/components/role-gate";
import type { CurrentUserRole } from "@workspace/api-client-react";

const ADMIN_ONLY: CurrentUserRole[] = ["admin"];
const MANAGERS: CurrentUserRole[] = ["admin", "manager"];
const MANAGER_ONLY: CurrentUserRole[] = ["manager"];
const ALL_ROLES: CurrentUserRole[] = ["admin", "manager", "employee"];

// REQUIRED — copy verbatim. Resolves the key from window.location.hostname so the
// same build serves multiple Clerk custom domains.
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

// REQUIRED — copy verbatim. Empty in dev (Clerk hits dev FAPI directly), auto-set
// in prod. Do NOT gate on import.meta.env.PROD / NODE_ENV.
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

// Clerk passes full paths to routerPush/routerReplace, but wouter's setLocation
// prepends the base — strip it to avoid doubling.
function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY in environment");
}

const queryClient = new QueryClient();

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "#C5A059",
    colorForeground: "#000033",
    colorMutedForeground: "#5b5b6b",
    colorDanger: "#b3261e",
    colorBackground: "#ffffff",
    colorInput: "#ffffff",
    colorInputForeground: "#000033",
    colorNeutral: "#d8d4c8",
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
    borderRadius: "0.625rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox:
      "bg-white rounded-2xl w-[440px] max-w-full overflow-hidden border border-[#e7e3d8] shadow-xl",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-[#000033] font-semibold",
    headerSubtitle: "text-[#5b5b6b]",
    socialButtonsBlockButtonText: "text-[#000033] font-medium",
    formFieldLabel: "text-[#000033] font-medium",
    footerActionLink: "text-[#C5A059] hover:text-[#a8873f] font-medium",
    footerActionText: "text-[#5b5b6b]",
    dividerText: "text-[#5b5b6b]",
    identityPreviewEditButton: "text-[#C5A059]",
    formFieldSuccessText: "text-[#0a7b34]",
    alertText: "text-[#000033]",
    logoBox: "h-10 flex items-center justify-center",
    logoImage: "h-10 w-auto",
    socialButtonsBlockButton: "border-[#d8d4c8] hover:bg-[#f8f7f4]",
    formButtonPrimary:
      "bg-[#C5A059] hover:bg-[#a8873f] text-[#000033] font-semibold",
    formFieldInput: "bg-white border-[#d8d4c8] text-[#000033]",
    dividerLine: "bg-[#e7e3d8]",
    alert: "border-[#e7e3d8]",
    otpCodeFieldInput: "border-[#d8d4c8] text-[#000033]",
    main: "gap-6",
  },
};

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[#000033] px-4 py-10">
      <SignIn
        routing="path"
        path={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
        forceRedirectUrl={`${basePath}/dashboard`}
      />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[#000033] px-4 py-10">
      <SignUp
        routing="path"
        path={`${basePath}/sign-up`}
        signInUrl={`${basePath}/sign-in`}
        forceRedirectUrl={`${basePath}/dashboard`}
      />
    </div>
  );
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <ProtectedShell>
          <RoleHomeRedirect />
        </ProtectedShell>
      </Show>
      <Show when="signed-out">
        <Landing />
      </Show>
    </>
  );
}

function Protected({ children }: { children: ReactNode }) {
  return (
    <>
      <Show when="signed-in">{children}</Show>
      <Show when="signed-out">
        <Redirect to="/sign-in" />
      </Show>
    </>
  );
}

// Keeps the cached webview fresh when the signed-in user changes.
function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

function Gated({
  allow,
  children,
}: {
  allow: CurrentUserRole[];
  children: ReactNode;
}) {
  return (
    <Protected>
      <ProtectedShell>
        <RoleGate allow={allow}>
          <Layout>{children}</Layout>
        </RoleGate>
      </ProtectedShell>
    </Protected>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomeRedirect} />
      {/* REQUIRED — copy "/sign-in/*?" and "/sign-up/*?" verbatim. */}
      <Route path="/sign-in/*?" component={SignInPage} />
      <Route path="/sign-up/*?" component={SignUpPage} />
      {/* Public, un-authenticated job application flow. */}
      <Route path="/apply" component={Apply} />
      {/* Public, un-authenticated candidate onboarding intake. */}
      <Route path="/candidate-onboarding" component={CandidateOnboarding} />
      {/* Public registration alias — intentionally reuses the exact onboarding template. */}
      <Route path="/candidate-registration" component={CandidateOnboarding} />
      {/* Signed-in but unlinked non-admins land here. */}
      <Route path="/no-access">
        <Protected>
          <NoAccess />
        </Protected>
      </Route>

      {/* Self-service (everyone with a login) */}
      <Route path="/my-leave">
        <Gated allow={ALL_ROLES}><MyLeave /></Gated>
      </Route>
      <Route path="/my-profile">
        <Gated allow={ALL_ROLES}><MyProfile /></Gated>
      </Route>

      {/* Manager */}
      <Route path="/team-leave">
        <Gated allow={MANAGERS}><TeamLeave /></Gated>
      </Route>
      <Route path="/team-sickness">
        <Gated allow={MANAGER_ONLY}><TeamSickness /></Gated>
      </Route>
      <Route path="/team-pay">
        <Gated allow={MANAGER_ONLY}><TeamPay /></Gated>
      </Route>
      <Route path="/team-recruitment">
        <Gated allow={MANAGER_ONLY}><TeamRecruitment /></Gated>
      </Route>

      {/* Admin-only */}
      <Route path="/dashboard">
        <Gated allow={ADMIN_ONLY}><Dashboard /></Gated>
      </Route>
      <Route path="/employees">
        <Gated allow={ADMIN_ONLY}><Employees /></Gated>
      </Route>
      <Route path="/employees/:id">
        <Gated allow={ADMIN_ONLY}><EmployeeDetail /></Gated>
      </Route>
      <Route path="/recruitment">
        <Gated allow={ADMIN_ONLY}><Recruitment /></Gated>
      </Route>
      <Route path="/candidates/:id">
        <Gated allow={ADMIN_ONLY}><CandidateDetail /></Gated>
      </Route>
      <Route path="/onboarding">
        <Gated allow={ADMIN_ONLY}><Onboarding /></Gated>
      </Route>
      <Route path="/training">
        <Gated allow={ADMIN_ONLY}><Training /></Gated>
      </Route>
      <Route path="/leave">
        <Gated allow={ADMIN_ONLY}><Leave /></Gated>
      </Route>
      <Route path="/sickness">
        <Gated allow={ADMIN_ONLY}><Sickness /></Gated>
      </Route>
      <Route path="/pay">
        <Gated allow={ADMIN_ONLY}><Pay /></Gated>
      </Route>
      <Route path="/benefits">
        <Gated allow={ADMIN_ONLY}><Benefits /></Gated>
      </Route>
      <Route path="/import">
        <Gated allow={ADMIN_ONLY}><ImportPage /></Gated>
      </Route>
      <Route path="/admin/users">
        <Gated allow={ADMIN_ONLY}><AdminUsers /></Gated>
      </Route>
      <Route path="/admin/cleanup-health">
        <Gated allow={ADMIN_ONLY}><CleanupHealth /></Gated>
      </Route>
      <Route path="/settings">
        <Gated allow={ADMIN_ONLY}><SettingsPage /></Gated>
      </Route>
      <Route>
        <Gated allow={ALL_ROLES}><NotFound /></Gated>
      </Route>
    </Switch>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: "Sign in to Amiga Specialty HR",
            subtitle: "Welcome back — access your HR workspace",
          },
        },
        signUp: {
          start: {
            title: "Create your account",
            subtitle: "Set up access to Amiga Specialty HR",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <Router />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
