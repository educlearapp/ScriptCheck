import { Router } from "express";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { requirePaidPlan } from "../middleware/requirePaidPlan";
import { requirePermission } from "../middleware/requirePermission";
import { PERMISSIONS } from "../services/permissions";
import {
  ExportError,
  generateAssessmentPackPdf,
} from "../services/export/assessmentPackExport";

const router = Router();

router.get(
  "/assessments/:id/pack.pdf",
  requireAuth,
  requirePaidPlan,
  requirePermission(PERMISSIONS.EXPORT_ASSESSMENT_PACK),
  async (req: AuthenticatedRequest, res) => {
    try {
      const buffer = await generateAssessmentPackPdf(
        String(req.params.id),
        req.auth!.workspaceId,
        req.auth!.userId,
        {
          includeAssessment: req.query.assessment !== "false",
          includeMemorandum: req.query.memo !== "false",
          includeRubric: req.query.rubric !== "false",
          includeAudit: req.query.audit !== "false",
          includeIntelligence: req.query.intelligence !== "false",
        }
      );

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="assessment-pack-${req.params.id}.pdf"`
      );
      return res.send(buffer);
    } catch (err) {
      if (err instanceof ExportError) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      console.error("[export/pack]", err);
      return res.status(500).json({ error: "Failed to generate assessment pack" });
    }
  }
);

export default router;
