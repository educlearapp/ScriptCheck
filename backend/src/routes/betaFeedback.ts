import fs from "fs/promises";
import { Router, type Response } from "express";
import multer from "multer";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/requirePermission";
import { PERMISSIONS } from "../services/permissions";
import {
  BetaFeedbackError,
  createBetaFeedback,
  getBetaFeedbackScreenshot,
  listBetaFeedback,
  updateBetaFeedbackStatus,
} from "../services/betaFeedback";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

function handleError(res: Response, err: unknown) {
  if (err instanceof BetaFeedbackError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  console.error("[beta-feedback]", err);
  return res.status(500).json({ error: "Beta feedback request failed" });
}

router.get(
  "/",
  requireAuth,
  requirePermission(PERMISSIONS.BETA_FEEDBACK_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const items = await listBetaFeedback(req.access!, req.auth!.workspaceId);
      return res.json({ items });
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.post(
  "/",
  requireAuth,
  requirePermission(PERMISSIONS.BETA_FEEDBACK_CREATE),
  upload.single("screenshot"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const item = await createBetaFeedback(
        req.access!,
        req.auth!.workspaceId,
        req.auth!.userId,
        req.body,
        req.file
      );
      return res.status(201).json(item);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.patch(
  "/:id/status",
  requireAuth,
  requirePermission(PERMISSIONS.BETA_FEEDBACK_MANAGE),
  async (req: AuthenticatedRequest, res) => {
    try {
      const item = await updateBetaFeedbackStatus(
        req.access!,
        req.auth!.workspaceId,
        String(req.params.id),
        String(req.body.status ?? "")
      );
      return res.json(item);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.get(
  "/:id/screenshot",
  requireAuth,
  requirePermission(PERMISSIONS.BETA_FEEDBACK_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { filePath, mimeType } = await getBetaFeedbackScreenshot(
        req.access!,
        req.auth!.workspaceId,
        String(req.params.id)
      );
      const data = await fs.readFile(filePath);
      res.setHeader("Content-Type", mimeType);
      res.setHeader("Cache-Control", "private, max-age=3600");
      return res.send(data);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

export default router;
