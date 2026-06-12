import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { getAllowedOrigins } from "./config/cors";
import { getAppEnvironment } from "./config/env";
import { prisma } from "./prisma";

import authRoutes from "./routes/auth";
import workspacesRoutes from "./routes/workspaces";
import usersRoutes from "./routes/users";
import curriculumRoutes from "./routes/curriculum";
import assessmentsRoutes from "./routes/assessments";
import assessmentGenerationRoutes from "./routes/assessmentGeneration";
import aiAssessmentBuilderRoutes from "./routes/aiAssessmentBuilder";
import questionBankRoutes from "./routes/questionBank";
import assessmentTemplatesRoutes from "./routes/assessmentTemplates";
import learnersRoutes from "./routes/learners";
import scriptBatchesRoutes from "./routes/scriptBatches";
import scriptsRoutes from "./routes/scripts";
import dashboardRoutes from "./routes/dashboard";
import resultsRoutes from "./routes/results";
import publishedResultsRoutes from "./routes/publishedResults";
import examSessionsRoutes from "./routes/examSessions";
import subjectsRoutes from "./routes/subjects";
import rubricsRoutes from "./routes/rubrics";
import scheduleRoutes from "./routes/schedule";
import markCaptureRoutes from "./routes/markCapture";
import markImportRoutes from "./routes/markImport";
import concessionsRoutes from "./routes/concessions";
import portalRoutes from "./routes/portal";
import analysisRoutes from "./routes/analysis";
import interventionsRoutes from "./routes/interventions";
import examinationsRoutes from "./routes/examinations";
import moderationCentreRoutes from "./routes/moderationCentre";
import markingRoutes from "./routes/marking";
import workflowRoutes from "./routes/workflow";
import intelligenceRoutes from "./routes/intelligence";
import subscriptionRoutes from "./routes/subscription";
import exportRoutes from "./routes/export";
import moderationTrailRoutes from "./routes/moderationTrail";
import betaFeedbackRoutes from "./routes/betaFeedback";
import superAdminRoutes from "./routes/superAdmin";
import timetableRoutes from "./routes/timetable";

const app = express();
const PORT = Number(process.env.PORT) || 3001;
const appEnv = getAppEnvironment();

app.set("trust proxy", 1);
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      const allowed = getAllowedOrigins();
      if (allowed.includes(origin)) return callback(null, true);
      callback(null, false);
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "2mb" }));

app.get("/health", async (_req, res) => {
  let database: "connected" | "disconnected" = "disconnected";
  try {
    await prisma.$queryRaw`SELECT 1`;
    database = "connected";
  } catch {
    database = "disconnected";
  }

  const ok = database === "connected";
  // Always 200 for platform health probes — database status is in the body.
  res.status(200).json({
    ok,
    service: "scriptcheck-api",
    version: "0.8.0",
    environment: appEnv,
    database,
    uploads: process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads"),
  });
});

app.use("/auth", authRoutes);
app.use("/workspaces", workspacesRoutes);
app.use("/users", usersRoutes);
app.use("/curriculum", curriculumRoutes);
app.use("/assessments", assessmentsRoutes);
app.use("/assessment-generation", assessmentGenerationRoutes);
app.use("/ai-assessment-builder", aiAssessmentBuilderRoutes);
app.use("/question-bank", questionBankRoutes);
app.use("/assessment-templates", assessmentTemplatesRoutes);
app.use("/learners", learnersRoutes);
app.use("/script-batches", scriptBatchesRoutes);
app.use("/scripts", scriptsRoutes);
app.use("/dashboard", dashboardRoutes);
app.use("/results", resultsRoutes);
app.use("/published-results", publishedResultsRoutes);
app.use("/exam-sessions", examSessionsRoutes);
app.use("/subjects", subjectsRoutes);
app.use("/rubrics", rubricsRoutes);
app.use("/schedule", scheduleRoutes);
app.use("/mark-capture", markCaptureRoutes);
app.use("/mark-import", markImportRoutes);
app.use("/concessions", concessionsRoutes);
app.use("/portal", portalRoutes);
app.use("/analysis", analysisRoutes);
app.use("/interventions", interventionsRoutes);
app.use("/examinations", examinationsRoutes);
app.use("/moderation", moderationCentreRoutes);
app.use("/marking", markingRoutes);
app.use("/moderation-trail", moderationTrailRoutes);
app.use("/workflow", workflowRoutes);
app.use("/intelligence", intelligenceRoutes);
app.use("/subscription", subscriptionRoutes);
app.use("/export", exportRoutes);
app.use("/beta-feedback", betaFeedbackRoutes);
app.use("/super-admin", superAdminRoutes);
app.use("/timetable", timetableRoutes);

app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error("[api]", err);
    res.status(500).json({ error: "Internal server error" });
  }
);

app.listen(PORT, () => {
  console.log(`ScriptCheck API listening on http://localhost:${PORT}`);
});
