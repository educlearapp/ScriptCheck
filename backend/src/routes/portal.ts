import { Router, type Response } from "express";
import { PortalUserType } from "@prisma/client";
import { prisma } from "../prisma";
import {
  PortalRequest,
  assertLearnerAccess,
  requirePortalAuth,
} from "../middleware/portalAuth";
import { auditRequestMeta, logAudit } from "../services/auditLog";
import {
  PortalAuthError,
  getPortalProfile,
  requestPortalOtp,
  verifyPortalOtp,
} from "../services/portalAuth";
import {
  getPortalAnalytics,
  getPortalAssessmentDetail,
  getPortalLearnerDashboard,
  getPortalLearnerHistory,
  getPortalParentDashboard,
  listPortalAssessments,
} from "../services/portalData";
import {
  generatePortalProgressPdf,
} from "../services/portalReports";
import { PortalError } from "../middleware/portalAuth";

const router = Router();

function handleError(res: Response, err: unknown) {
  if (err instanceof PortalAuthError || err instanceof PortalError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  console.error("[portal]", err);
  return res.status(500).json({ error: "Portal operation failed" });
}

router.post("/auth/request-otp", async (req, res) => {
  try {
    const { workspaceSlug, portalType, email, learnerNumber } = req.body as {
      workspaceSlug: string;
      portalType: PortalUserType;
      email?: string;
      learnerNumber?: string;
    };

    if (!workspaceSlug || !portalType) {
      return res.status(400).json({ error: "workspaceSlug and portalType are required" });
    }

    const result = await requestPortalOtp({
      workspaceSlug,
      portalType,
      email,
      learnerNumber,
    });
    return res.json(result);
  } catch (err) {
    return handleError(res, err);
  }
});

router.post("/auth/verify-otp", async (req, res) => {
  try {
    const { workspaceSlug, portalType, email, learnerNumber, code } = req.body as {
      workspaceSlug: string;
      portalType: PortalUserType;
      email?: string;
      learnerNumber?: string;
      code: string;
    };

    const result = await verifyPortalOtp(
      { workspaceSlug, portalType, email, learnerNumber, code },
      auditRequestMeta(req)
    );
    return res.json(result);
  } catch (err) {
    return handleError(res, err);
  }
});

router.post("/auth/logout", requirePortalAuth, async (req: PortalRequest, res) => {
  try {
    await logAudit({
      action: "PORTAL_LOGOUT",
      workspaceId: req.portal!.workspaceId,
      metadata: { portalAccountId: req.portal!.portalAccountId },
      ...auditRequestMeta(req),
    });
    return res.json({ ok: true });
  } catch (err) {
    return handleError(res, err);
  }
});

router.get("/auth/me", requirePortalAuth, async (req: PortalRequest, res) => {
  try {
    const profile = await getPortalProfile(
      req.portal!.portalAccountId,
      req.portal!.workspaceId
    );
    return res.json(profile);
  } catch (err) {
    return handleError(res, err);
  }
});

router.get("/dashboard", requirePortalAuth, async (req: PortalRequest, res) => {
  try {
    const session = req.portal!;

    if (session.portalType === PortalUserType.PARENT) {
      const data = await getPortalParentDashboard(
        session.workspaceId,
        session.learnerIds
      );
      return res.json({ type: "parent", ...data });
    }

    const learnerId = session.learnerIds[0];
    if (!learnerId) {
      return res.status(404).json({ error: "No learner linked to this account" });
    }

    const data = await getPortalLearnerDashboard(session.workspaceId, learnerId);
    return res.json({ type: "learner", ...data });
  } catch (err) {
    return handleError(res, err);
  }
});

router.get(
  "/learners/:learnerId/dashboard",
  requirePortalAuth,
  async (req: PortalRequest, res) => {
    try {
      const learnerId = String(req.params.learnerId);
      assertLearnerAccess(req.portal!, learnerId, req);
      const data = await getPortalLearnerDashboard(req.portal!.workspaceId, learnerId);
      return res.json(data);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.get(
  "/learners/:learnerId/assessments",
  requirePortalAuth,
  async (req: PortalRequest, res) => {
    try {
      const learnerId = String(req.params.learnerId);
      assertLearnerAccess(req.portal!, learnerId, req);
      const data = await listPortalAssessments(req.portal!.workspaceId, learnerId);
      return res.json(data);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.get(
  "/learners/:learnerId/assessments/:assessmentId",
  requirePortalAuth,
  async (req: PortalRequest, res) => {
    try {
      const learnerId = String(req.params.learnerId);
      const assessmentId = String(req.params.assessmentId);
      assertLearnerAccess(req.portal!, learnerId, req);
      const data = await getPortalAssessmentDetail(
        req.portal!.workspaceId,
        learnerId,
        assessmentId
      );
      return res.json(data);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.get(
  "/learners/:learnerId/history",
  requirePortalAuth,
  async (req: PortalRequest, res) => {
    try {
      const learnerId = String(req.params.learnerId);
      assertLearnerAccess(req.portal!, learnerId, req);
      const data = await getPortalLearnerHistory(req.portal!.workspaceId, learnerId);
      return res.json(data);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.get(
  "/learners/:learnerId/analytics",
  requirePortalAuth,
  async (req: PortalRequest, res) => {
    try {
      const learnerId = String(req.params.learnerId);
      assertLearnerAccess(req.portal!, learnerId, req);
      const data = await getPortalAnalytics(req.portal!.workspaceId, learnerId);
      return res.json(data);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.get(
  "/learners/:learnerId/reports/progress.pdf",
  requirePortalAuth,
  async (req: PortalRequest, res) => {
    try {
      const learnerId = String(req.params.learnerId);
      assertLearnerAccess(req.portal!, learnerId, req);

      const pdf = await generatePortalProgressPdf(req.portal!.workspaceId, learnerId);

      const learner = await prisma.learner.findFirst({
        where: { id: learnerId },
        select: { learnerNumber: true, firstName: true, lastName: true },
      });

      const safeName = learner
        ? `${learner.firstName}-${learner.lastName}`.replace(/[^a-zA-Z0-9-_]+/g, "-")
        : "learner";

      await logAudit({
        action: "PORTAL_REPORT_DOWNLOADED",
        workspaceId: req.portal!.workspaceId,
        metadata: {
          portalAccountId: req.portal!.portalAccountId,
          learnerId,
          reportType: "progress",
        },
        ...auditRequestMeta(req),
      });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${safeName}-progress-report.pdf"`
      );
      return res.send(pdf);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

export default router;
