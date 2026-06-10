import "dotenv/config";
import express from "express";
import cors from "cors";

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

const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "scriptcheck-api", version: "0.7.1", phase: "ai-assessment-builder-ocr" });
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
