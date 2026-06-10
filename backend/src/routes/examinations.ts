import { Router, type Response } from "express";
import { ExaminationIncidentStatus, ExaminationOpsSessionStatus } from "@prisma/client";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/requirePermission";
import { PERMISSIONS } from "../services/permissions";
import { ExaminationError } from "../services/examinationErrors";
import {
  createSlot,
  createTimetable,
  createVenue,
  getTimetableCalendar,
  listSlots,
  listTimetables,
  listVenues,
} from "../services/examinationTimetable";
import {
  createOpsSession,
  createSessionFromSlot,
  listOpsSessions,
  updateOpsSessionStatus,
} from "../services/examinationOpsSessions";
import {
  assignInvigilator,
  getCoverageReport,
  getInvigilatorWorkload,
  listInvigilatorAssignments,
} from "../services/examinationInvigilators";
import {
  generateCandidateListPdf,
  generateSeatingPlan,
  generateSeatingPlanPdf,
  getSeatingPlan,
  updateSeatingAllocation,
} from "../services/seatingPlan";
import { createIncident, listIncidents, updateIncident } from "../services/examinationIncidents";
import { generateExaminationPackPdf } from "../services/examinationPacks";
import { getExaminationDashboard } from "../services/examinationDashboard";
import { getReadinessByGrade, calculateExamReadiness } from "../services/examReadiness";
import {
  generateExaminationBoardPdf,
  generatePrincipalExaminationPdf,
} from "../services/examinationReports";

const router = Router();

function handleError(res: Response, err: unknown) {
  if (err instanceof ExaminationError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  console.error("[examinations]", err);
  return res.status(500).json({ error: "Examination request failed" });
}

router.get(
  "/dashboard",
  requireAuth,
  requirePermission(PERMISSIONS.EXAMINATIONS_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const data = await getExaminationDashboard(req.auth!.workspaceId);
      return res.json(data);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.get(
  "/readiness/by-grade",
  requireAuth,
  requirePermission(PERMISSIONS.EXAMINATIONS_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const data = await getReadinessByGrade(req.auth!.workspaceId);
      return res.json(data);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.get(
  "/readiness",
  requireAuth,
  requirePermission(PERMISSIONS.EXAMINATIONS_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const data = await calculateExamReadiness(req.auth!.workspaceId, {
        gradeId: req.query.gradeId ? String(req.query.gradeId) : undefined,
        subjectId: req.query.subjectId ? String(req.query.subjectId) : undefined,
        department: req.query.department ? String(req.query.department) : undefined,
        forceRefresh: req.query.refresh === "true",
        actorId: req.query.refresh === "true" ? req.auth!.userId : undefined,
      });
      return res.json(data);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.get(
  "/venues",
  requireAuth,
  requirePermission(PERMISSIONS.EXAMINATIONS_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      return res.json(await listVenues(req.auth!.workspaceId));
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.post(
  "/venues",
  requireAuth,
  requirePermission(PERMISSIONS.EXAMINATIONS_MANAGE),
  async (req: AuthenticatedRequest, res) => {
    try {
      const venue = await createVenue(req.auth!.workspaceId, req.body);
      return res.status(201).json(venue);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.get(
  "/timetable",
  requireAuth,
  requirePermission(PERMISSIONS.EXAMINATIONS_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      if (req.query.start && req.query.end) {
        const data = await getTimetableCalendar(
          req.auth!.workspaceId,
          String(req.query.start),
          String(req.query.end),
          req.query.view === "daily" ? "daily" : "weekly"
        );
        return res.json(data);
      }
      if (req.query.slots === "true") {
        return res.json(
          await listSlots(req.auth!.workspaceId, {
            gradeId: req.query.gradeId ? String(req.query.gradeId) : undefined,
            subjectId: req.query.subjectId ? String(req.query.subjectId) : undefined,
            timetableId: req.query.timetableId ? String(req.query.timetableId) : undefined,
          })
        );
      }
      return res.json(await listTimetables(req.auth!.workspaceId));
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.post(
  "/timetable",
  requireAuth,
  requirePermission(PERMISSIONS.EXAMINATIONS_MANAGE),
  async (req: AuthenticatedRequest, res) => {
    try {
      const data = await createTimetable(req.auth!.workspaceId, req.auth!.userId, req.body);
      return res.status(201).json(data);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.post(
  "/timetable/slots",
  requireAuth,
  requirePermission(PERMISSIONS.EXAMINATIONS_MANAGE),
  async (req: AuthenticatedRequest, res) => {
    try {
      const data = await createSlot(req.auth!.workspaceId, req.auth!.userId, req.body);
      return res.status(201).json(data);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.get(
  "/sessions",
  requireAuth,
  requirePermission(PERMISSIONS.EXAMINATIONS_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const status = req.query.status
        ? (String(req.query.status) as ExaminationOpsSessionStatus)
        : undefined;
      return res.json(await listOpsSessions(req.auth!.workspaceId, { status }));
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.post(
  "/sessions",
  requireAuth,
  requirePermission(PERMISSIONS.EXAMINATIONS_MANAGE),
  async (req: AuthenticatedRequest, res) => {
    try {
      const data = await createOpsSession(req.auth!.workspaceId, req.auth!.userId, req.body);
      return res.status(201).json(data);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.post(
  "/sessions/from-slot/:slotId",
  requireAuth,
  requirePermission(PERMISSIONS.EXAMINATIONS_MANAGE),
  async (req: AuthenticatedRequest, res) => {
    try {
      const data = await createSessionFromSlot(
        req.auth!.workspaceId,
        String(req.params.slotId),
        req.auth!.userId
      );
      return res.status(201).json(data);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.patch(
  "/sessions/:id/status",
  requireAuth,
  requirePermission(PERMISSIONS.EXAMINATIONS_MANAGE),
  async (req: AuthenticatedRequest, res) => {
    try {
      const data = await updateOpsSessionStatus(
        req.auth!.workspaceId,
        String(req.params.id),
        req.auth!.userId,
        req.body.status
      );
      return res.json(data);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.get(
  "/invigilators",
  requireAuth,
  requirePermission(PERMISSIONS.EXAMINATIONS_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      if (req.query.workload === "true") {
        return res.json(await getInvigilatorWorkload(req.auth!.workspaceId));
      }
      if (req.query.coverage === "true") {
        return res.json(await getCoverageReport(req.auth!.workspaceId));
      }
      return res.json(
        await listInvigilatorAssignments(
          req.auth!.workspaceId,
          req.query.userId ? String(req.query.userId) : undefined
        )
      );
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.post(
  "/invigilators/assign",
  requireAuth,
  requirePermission(PERMISSIONS.EXAMINATIONS_MANAGE),
  async (req: AuthenticatedRequest, res) => {
    try {
      const data = await assignInvigilator(req.auth!.workspaceId, req.auth!.userId, req.body);
      return res.status(201).json(data);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.get(
  "/seating/:sessionId",
  requireAuth,
  requirePermission(PERMISSIONS.EXAMINATIONS_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const data = await getSeatingPlan(req.auth!.workspaceId, String(req.params.sessionId));
      return res.json(data);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.post(
  "/seating/:sessionId/generate",
  requireAuth,
  requirePermission(PERMISSIONS.EXAMINATIONS_MANAGE),
  async (req: AuthenticatedRequest, res) => {
    try {
      const data = await generateSeatingPlan(
        req.auth!.workspaceId,
        String(req.params.sessionId),
        req.auth!.userId,
        req.body.allocations
      );
      return res.json(data);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.patch(
  "/seating/:planId/allocation",
  requireAuth,
  requirePermission(PERMISSIONS.EXAMINATIONS_MANAGE),
  async (req: AuthenticatedRequest, res) => {
    try {
      const data = await updateSeatingAllocation(
        req.auth!.workspaceId,
        String(req.params.planId),
        req.body.learnerId,
        req.body.row,
        req.body.column
      );
      return res.json(data);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.get(
  "/seating/:sessionId/plan.pdf",
  requireAuth,
  requirePermission(PERMISSIONS.REPORTS_GENERATE),
  async (req: AuthenticatedRequest, res) => {
    try {
      const buffer = await generateSeatingPlanPdf(
        req.auth!.workspaceId,
        String(req.params.sessionId),
        req.auth!.userId
      );
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", 'attachment; filename="seating-plan.pdf"');
      return res.send(buffer);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.get(
  "/seating/:sessionId/candidates.pdf",
  requireAuth,
  requirePermission(PERMISSIONS.REPORTS_GENERATE),
  async (req: AuthenticatedRequest, res) => {
    try {
      const buffer = await generateCandidateListPdf(
        req.auth!.workspaceId,
        String(req.params.sessionId)
      );
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", 'attachment; filename="candidate-list.pdf"');
      return res.send(buffer);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.get(
  "/packs/:sessionId.pdf",
  requireAuth,
  requirePermission(PERMISSIONS.REPORTS_GENERATE),
  async (req: AuthenticatedRequest, res) => {
    try {
      const buffer = await generateExaminationPackPdf(
        req.auth!.workspaceId,
        String(req.params.sessionId),
        req.auth!.userId
      );
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", 'attachment; filename="examination-pack.pdf"');
      return res.send(buffer);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.get(
  "/incidents",
  requireAuth,
  requirePermission(PERMISSIONS.EXAMINATIONS_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const data = await listIncidents(req.auth!.workspaceId, {
        status: req.query.status ? (String(req.query.status) as ExaminationIncidentStatus) : undefined,
        sessionId: req.query.sessionId ? String(req.query.sessionId) : undefined,
      });
      return res.json(data);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.post(
  "/incidents",
  requireAuth,
  requirePermission(PERMISSIONS.EXAMINATIONS_MANAGE),
  async (req: AuthenticatedRequest, res) => {
    try {
      const data = await createIncident(req.auth!.workspaceId, req.auth!.userId, req.body);
      return res.status(201).json(data);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.patch(
  "/incidents/:id",
  requireAuth,
  requirePermission(PERMISSIONS.EXAMINATIONS_MANAGE),
  async (req: AuthenticatedRequest, res) => {
    try {
      const data = await updateIncident(
        req.auth!.workspaceId,
        String(req.params.id),
        req.auth!.userId,
        req.body
      );
      return res.json(data);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.get(
  "/reports/principal.pdf",
  requireAuth,
  requirePermission(PERMISSIONS.REPORTS_GENERATE),
  async (req: AuthenticatedRequest, res) => {
    try {
      const buffer = await generatePrincipalExaminationPdf(
        req.auth!.workspaceId,
        req.access!,
        req.auth!.userId
      );
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", 'attachment; filename="principal-examination-report.pdf"');
      return res.send(buffer);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.get(
  "/reports/board.pdf",
  requireAuth,
  requirePermission(PERMISSIONS.REPORTS_GENERATE),
  async (req: AuthenticatedRequest, res) => {
    try {
      const buffer = await generateExaminationBoardPdf(
        req.auth!.workspaceId,
        req.access!,
        req.auth!.userId
      );
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", 'attachment; filename="examination-board-report.pdf"');
      return res.send(buffer);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

export default router;
