import { Router } from "express";
import { prisma } from "../prisma";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/requirePermission";
import { PERMISSIONS } from "../services/permissions";
import { auditRequestMeta, logAudit } from "../services/auditLog";
import {
  createCurriculumTopic,
  listCurriculumTopics,
  QuestionBankError,
} from "../services/questionBank";

const router = Router();

router.get(
  "/",
  requireAuth,
  requirePermission(PERMISSIONS.CURRICULUM_VIEW),
  async (_req, res) => {
    try {
      const curriculums = await prisma.curriculum.findMany({
        orderBy: { code: "asc" },
        select: {
          id: true,
          code: true,
          name: true,
          _count: { select: { phases: true } },
        },
      });

      return res.json(
        curriculums.map((c) => ({
          id: c.id,
          code: c.code,
          name: c.name,
          phaseCount: c._count.phases,
        }))
      );
    } catch (err) {
      console.error("[curriculum]", err);
      return res.status(500).json({ error: "Failed to list curriculums" });
    }
  }
);

router.get(
  "/tree",
  requireAuth,
  requirePermission(PERMISSIONS.CURRICULUM_VIEW),
  async (_req, res) => {
    try {
      const curriculums = await prisma.curriculum.findMany({
        orderBy: { code: "asc" },
        include: {
          phases: {
            orderBy: { orderIndex: "asc" },
            include: {
              grades: { orderBy: { orderIndex: "asc" } },
              subjects: {
                where: { active: true },
                orderBy: [{ category: "asc" }, { name: "asc" }],
              },
            },
          },
        },
      });

      return res.json(curriculums);
    } catch (err) {
      console.error("[curriculum/tree]", err);
      return res.status(500).json({ error: "Failed to load curriculum tree" });
    }
  }
);

router.get(
  "/topics",
  requireAuth,
  requirePermission(PERMISSIONS.CURRICULUM_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const topics = await listCurriculumTopics({
        curriculumId: req.query.curriculumId
          ? String(req.query.curriculumId)
          : undefined,
        phaseId: req.query.phaseId ? String(req.query.phaseId) : undefined,
        gradeId: req.query.gradeId ? String(req.query.gradeId) : undefined,
        subjectId: req.query.subjectId ? String(req.query.subjectId) : undefined,
      });
      return res.json(topics);
    } catch (err) {
      console.error("[curriculum/topics]", err);
      return res.status(500).json({ error: "Failed to list topics" });
    }
  }
);

router.post(
  "/topics",
  requireAuth,
  requirePermission(PERMISSIONS.CURRICULUM_TOPICS_MANAGE),
  async (req: AuthenticatedRequest, res) => {
    const body = req.body ?? {};

    if (!body.curriculumId || !body.phaseId || !body.gradeId || !body.subjectId || !body.topic) {
      return res.status(400).json({
        error: "curriculumId, phaseId, gradeId, subjectId, and topic are required",
      });
    }

    try {
      const topic = await createCurriculumTopic({
        curriculumId: String(body.curriculumId),
        phaseId: String(body.phaseId),
        gradeId: String(body.gradeId),
        subjectId: String(body.subjectId),
        topic: String(body.topic),
        subtopic: body.subtopic ?? null,
        orderIndex: body.orderIndex != null ? Number(body.orderIndex) : 0,
      });

      await logAudit({
        action: "CURRICULUM_TOPIC_CREATED",
        actorId: req.auth!.userId,
        workspaceId: req.auth!.workspaceId,
        metadata: { topicId: topic.id, topic: topic.topic, subtopic: topic.subtopic },
        ...auditRequestMeta(req),
      });

      return res.status(201).json(topic);
    } catch (err) {
      if (err instanceof QuestionBankError) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      console.error("[curriculum/topics create]", err);
      return res.status(500).json({ error: "Failed to create topic" });
    }
  }
);

router.get(
  "/:curriculumId/phases",
  requireAuth,
  requirePermission(PERMISSIONS.CURRICULUM_VIEW),
  async (req: AuthenticatedRequest, res) => {
    const curriculumId = String(req.params.curriculumId);

    try {
      const phases = await prisma.phase.findMany({
        where: { curriculumId },
        orderBy: { orderIndex: "asc" },
        select: {
          id: true,
          curriculumId: true,
          code: true,
          name: true,
          orderIndex: true,
        },
      });

      return res.json(phases);
    } catch (err) {
      console.error("[curriculum/phases]", err);
      return res.status(500).json({ error: "Failed to list phases" });
    }
  }
);

router.get(
  "/phases/:phaseId/grades",
  requireAuth,
  requirePermission(PERMISSIONS.CURRICULUM_VIEW),
  async (req: AuthenticatedRequest, res) => {
    const phaseId = String(req.params.phaseId);

    try {
      const grades = await prisma.grade.findMany({
        where: { phaseId },
        orderBy: { orderIndex: "asc" },
        select: {
          id: true,
          phaseId: true,
          code: true,
          name: true,
          orderIndex: true,
        },
      });

      return res.json(grades);
    } catch (err) {
      console.error("[curriculum/grades]", err);
      return res.status(500).json({ error: "Failed to list grades" });
    }
  }
);

router.get(
  "/phases/:phaseId/subjects",
  requireAuth,
  requirePermission(PERMISSIONS.CURRICULUM_VIEW),
  async (req: AuthenticatedRequest, res) => {
    const phaseId = String(req.params.phaseId);

    try {
      const subjects = await prisma.subject.findMany({
        where: { phaseId, active: true },
        orderBy: [{ category: "asc" }, { name: "asc" }],
        select: {
          id: true,
          curriculumId: true,
          phaseId: true,
          code: true,
          name: true,
          category: true,
          active: true,
        },
      });

      return res.json(subjects);
    } catch (err) {
      console.error("[curriculum/subjects]", err);
      return res.status(500).json({ error: "Failed to list subjects" });
    }
  }
);

export default router;
