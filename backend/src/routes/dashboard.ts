import { Router } from "express";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/requirePermission";
import { PERMISSIONS } from "../services/permissions";
import {
  getAcademicDashboard,
  getHodDashboard,
  getPrincipalDashboard,
  getTeacherDashboard,
} from "../services/academicDashboard";
import { calculateExamReadiness } from "../services/examReadiness";
import { getSchoolAcademicTrends } from "../services/academicTrends";
import { logAudit, auditRequestMeta } from "../services/auditLog";
import {
  generateGoverningBodyExecutivePdf,
  generatePrincipalExecutivePdf,
} from "../services/executiveReports";
import { getExaminationDashboard } from "../services/examinationDashboard";
import {
  hasAnyRole,
  hasPermission,
} from "../services/permissions";
import { WorkspaceRole } from "@prisma/client";

const router = Router();

function canViewPrincipalDashboard(access: NonNullable<AuthenticatedRequest["access"]>, workspaceId: string) {
  return (
    hasPermission(access, workspaceId, PERMISSIONS.WORKSPACE_MANAGE) ||
    hasAnyRole(access, workspaceId, [
      WorkspaceRole.PRINCIPAL,
      WorkspaceRole.SCHOOL_ADMIN,
      WorkspaceRole.EXAM_BODY_ADMIN,
    ])
  );
}

function canViewHodDashboard(access: NonNullable<AuthenticatedRequest["access"]>, workspaceId: string) {
  return (
    hasPermission(access, workspaceId, PERMISSIONS.MODERATION_QUEUE) ||
    hasAnyRole(access, workspaceId, [WorkspaceRole.HOD, WorkspaceRole.MODERATOR])
  );
}

router.get(
  "/academic",
  requireAuth,
  requirePermission(PERMISSIONS.DASHBOARD_ACADEMIC_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const data = await getAcademicDashboard(
        req.auth!.workspaceId,
        req.auth!.userId,
        req.access!
      );
      return res.json(data);
    } catch (err) {
      console.error("[dashboard/academic]", err);
      return res.status(500).json({ error: "Failed to load academic dashboard" });
    }
  }
);

router.get(
  "/principal",
  requireAuth,
  requirePermission(PERMISSIONS.DASHBOARD_ACADEMIC_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.auth!.workspaceId;
      if (!canViewPrincipalDashboard(req.access!, workspaceId)) {
        return res.status(403).json({ error: "Principal dashboard access required" });
      }

      const data = await getPrincipalDashboard(workspaceId);
      await logAudit({
        action: "PRINCIPAL_DASHBOARD_VIEWED",
        workspaceId,
        actorId: req.auth!.userId,
        ...auditRequestMeta(req),
      });
      return res.json(data);
    } catch (err) {
      console.error("[dashboard/principal]", err);
      return res.status(500).json({ error: "Failed to load principal dashboard" });
    }
  }
);

router.get(
  "/hod",
  requireAuth,
  requirePermission(PERMISSIONS.DASHBOARD_ACADEMIC_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.auth!.workspaceId;
      if (!canViewHodDashboard(req.access!, workspaceId)) {
        return res.status(403).json({ error: "HOD dashboard access required" });
      }

      const data = await getHodDashboard(workspaceId, req.access!);
      await logAudit({
        action: "HOD_DASHBOARD_VIEWED",
        workspaceId,
        actorId: req.auth!.userId,
        ...auditRequestMeta(req),
      });
      return res.json(data);
    } catch (err) {
      console.error("[dashboard/hod]", err);
      return res.status(500).json({ error: "Failed to load HOD dashboard" });
    }
  }
);

router.get(
  "/teacher",
  requireAuth,
  requirePermission(PERMISSIONS.DASHBOARD_ACADEMIC_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const data = await getTeacherDashboard(
        req.auth!.workspaceId,
        req.auth!.userId,
        req.access!
      );
      return res.json(data);
    } catch (err) {
      console.error("[dashboard/teacher]", err);
      return res.status(500).json({ error: "Failed to load teacher dashboard" });
    }
  }
);

router.get(
  "/exam-readiness",
  requireAuth,
  requirePermission(PERMISSIONS.DASHBOARD_ACADEMIC_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const department = req.query.department ? String(req.query.department) : undefined;
      const gradeId = req.query.gradeId ? String(req.query.gradeId) : undefined;
      const subjectId = req.query.subjectId ? String(req.query.subjectId) : undefined;
      const refresh = req.query.refresh === "true";
      const data = await calculateExamReadiness(req.auth!.workspaceId, {
        department,
        gradeId,
        subjectId,
        actorId: refresh ? req.auth!.userId : undefined,
        forceRefresh: refresh,
      });
      return res.json(data);
    } catch (err) {
      console.error("[dashboard/exam-readiness]", err);
      return res.status(500).json({ error: "Failed to calculate exam readiness" });
    }
  }
);

router.get(
  "/trends",
  requireAuth,
  requirePermission(PERMISSIONS.RESULTS_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const data = await getSchoolAcademicTrends(req.auth!.workspaceId);
      return res.json(data);
    } catch (err) {
      console.error("[dashboard/trends]", err);
      return res.status(500).json({ error: "Failed to load academic trends" });
    }
  }
);

router.get(
  "/reports/principal.pdf",
  requireAuth,
  requirePermission(PERMISSIONS.REPORTS_GENERATE),
  async (req: AuthenticatedRequest, res) => {
    try {
      const buffer = await generatePrincipalExecutivePdf(
        req.auth!.workspaceId,
        req.access!,
        req.auth!.userId
      );
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", 'attachment; filename="principal-executive-report.pdf"');
      return res.send(buffer);
    } catch (err) {
      console.error("[dashboard/reports/principal]", err);
      return res.status(500).json({ error: "Failed to generate principal report" });
    }
  }
);

router.get(
  "/reports/governing-body.pdf",
  requireAuth,
  requirePermission(PERMISSIONS.REPORTS_GENERATE),
  async (req: AuthenticatedRequest, res) => {
    try {
      const buffer = await generateGoverningBodyExecutivePdf(
        req.auth!.workspaceId,
        req.access!,
        req.auth!.userId
      );
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="governing-body-report.pdf"'
      );
      return res.send(buffer);
    } catch (err) {
      console.error("[dashboard/reports/governing-body]", err);
      return res.status(500).json({ error: "Failed to generate governing body report" });
    }
  }
);

router.get(
  "/examinations",
  requireAuth,
  requirePermission(PERMISSIONS.EXAMINATIONS_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const data = await getExaminationDashboard(req.auth!.workspaceId);
      return res.json(data);
    } catch (err) {
      console.error("[dashboard/examinations]", err);
      return res.status(500).json({ error: "Failed to load examination dashboard" });
    }
  }
);

export default router;
