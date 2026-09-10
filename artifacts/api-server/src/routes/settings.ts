import { Router, type IRouter, type Request, type Response } from "express";
import { emailConfigStatus, sendTestEmail } from "../lib/email";

const router: IRouter = Router();

router.get("/settings/email", (_req: Request, res: Response) => {
  res.json(emailConfigStatus());
});

router.post("/settings/email/test", async (req: Request, res: Response) => {
  const to = typeof req.body?.to === "string" ? req.body.to.trim() : "";
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    res.status(400).json({ sent: false, error: "Provide a valid email address" });
    return;
  }
  const result = await sendTestEmail(to);
  res.json({ sent: result.sent, error: result.error ?? null });
});

export default router;
