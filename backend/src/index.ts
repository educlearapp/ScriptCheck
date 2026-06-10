import "dotenv/config";
import express from "express";
import cors from "cors";

import authRoutes from "./routes/auth";
import workspacesRoutes from "./routes/workspaces";
import usersRoutes from "./routes/users";
import curriculumRoutes from "./routes/curriculum";
import assessmentsRoutes from "./routes/assessments";
import assessmentGenerationRoutes from "./routes/assessmentGeneration";
import questionBankRoutes from "./routes/questionBank";
import assessmentTemplatesRoutes from "./routes/assessmentTemplates";
import learnersRoutes from "./routes/learners";
import scriptBatchesRoutes from "./routes/scriptBatches";
import scriptsRoutes from "./routes/scripts";
import dashboardRoutes from "./routes/dashboard";
import resultsRoutes from "./routes/results";
import publishedResultsRoutes from "./routes/publishedResults";
import examSessionsRoutes from "./routes/examSessions";

const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "scriptcheck-api", phase: "lockdown-workflow-exam-security" });
});

app.use("/auth", authRoutes);
app.use("/workspaces", workspacesRoutes);
app.use("/users", usersRoutes);
app.use("/curriculum", curriculumRoutes);
app.use("/assessments", assessmentsRoutes);
app.use("/assessment-generation", assessmentGenerationRoutes);
app.use("/question-bank", questionBankRoutes);
app.use("/assessment-templates", assessmentTemplatesRoutes);
app.use("/learners", learnersRoutes);
app.use("/script-batches", scriptBatchesRoutes);
app.use("/scripts", scriptsRoutes);
app.use("/dashboard", dashboardRoutes);
app.use("/results", resultsRoutes);
app.use("/published-results", publishedResultsRoutes);
app.use("/exam-sessions", examSessionsRoutes);

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
