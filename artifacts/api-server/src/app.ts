import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import router from "./routes";
import { logger } from "./lib/logger";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import { tenantContext } from "./middlewares/tenant";
import { requireAuth } from "./middlewares/requireAuth";
import { resolveAppUser } from "./middlewares/resolveUser";
import { authorize } from "./middlewares/authorize";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// Clerk Frontend API proxy. Must be mounted BEFORE the body parsers because it
// streams raw bytes. No-op in dev (Clerk hits its dev FAPI directly).
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

app.use(cors({ credentials: true, origin: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Resolve the publishable key from the incoming request host so the same
// server can serve multiple Clerk custom domains. Falls back to
// CLERK_PUBLISHABLE_KEY when the host doesn't map to a custom domain.
app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

// Single-tenant: resolve req.tenantId (always the seeded Amiga tenant).
app.use(tenantContext());

// Require an authenticated Clerk user for /api/* (except public + health).
// Mounted at /api so its path checks are router-relative.
app.use("/api", requireAuth());

// Resolve the in-app user (role + linked employee) and enforce coarse-grained
// role access. Fine-grained ownership lives in the handlers (lib/authz.ts).
app.use("/api", resolveAppUser());
app.use("/api", authorize());

app.use("/api", router);

export default app;
