import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import AuthGuard from "./auth/AuthGuard";
import RequirePermission from "./auth/RequirePermission";
import AppLayout from "./components/layout/AppLayout";
import Login from "./pages/Login";
import DashboardRouter from "./pages/dashboard/DashboardRouter";
import AssessmentsList from "./pages/assessments/AssessmentsList";
import CreateAssessment from "./pages/assessments/CreateAssessment";
import GenerateAssessment from "./pages/assessments/GenerateAssessment";
import GenerationPreview from "./pages/assessments/GenerationPreview";
import AssessmentDetail from "./pages/assessments/AssessmentDetail";
import AssessmentResults from "./pages/assessments/AssessmentResults";
import AssessmentScripts from "./pages/scripts/AssessmentScripts";
import LearnerScriptDetail from "./pages/scripts/LearnerScriptDetail";
import QuestionBank from "./pages/questionBank/QuestionBank";
import AssessmentTemplates from "./pages/templates/AssessmentTemplates";
import UsersRolesPlaceholder from "./pages/users/UsersRolesPlaceholder";
import CurriculumManagement from "./pages/curriculum/CurriculumManagement";
import HodModerationQueue from "./pages/moderation/HodModerationQueue";
import BatchModerationDashboard from "./pages/moderation/BatchModerationDashboard";
import DepartmentResults from "./pages/results/DepartmentResults";
import PublishedResults from "./pages/results/PublishedResults";

function HomeRedirect() {
  const { isAuthenticated } = useAuth();
  return <Navigate to={isAuthenticated ? "/dashboard" : "/login"} replace />;
}

function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomeRedirect />} />
        <Route path="/login" element={<Login />} />

        <Route element={<AuthGuard />}>
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<DashboardRouter />} />

            <Route element={<RequirePermission permission="assessments.view" />}>
              <Route path="/assessments" element={<AssessmentsList />} />
              <Route path="/assessments/:id/scripts" element={<AssessmentScripts />} />
              <Route path="/assessments/:id" element={<AssessmentDetail />} />
            </Route>

            <Route element={<RequirePermission permission="results.view" />}>
              <Route path="/assessments/:id/results" element={<AssessmentResults />} />
              <Route path="/results" element={<DepartmentResults />} />
              <Route path="/published-results/:assessmentId" element={<PublishedResults />} />
            </Route>

            <Route element={<RequirePermission permission="scripts.view" />}>
              <Route path="/scripts/:scriptId" element={<LearnerScriptDetail />} />
              <Route path="/script-batches/:batchId/analytics" element={<BatchModerationDashboard />} />
            </Route>

            <Route element={<RequirePermission permission="assessments.create" />}>
              <Route path="/assessments/new" element={<CreateAssessment />} />
              <Route path="/assessments/generate" element={<GenerateAssessment />} />
              <Route
                path="/assessments/generate/:requestId"
                element={<GenerationPreview />}
              />
            </Route>

            <Route element={<RequirePermission permission="moderation.queue" />}>
              <Route path="/moderation/queue" element={<HodModerationQueue />} />
            </Route>

            <Route element={<RequirePermission permission="users.view" />}>
              <Route path="/users" element={<UsersRolesPlaceholder />} />
            </Route>

            <Route element={<RequirePermission permission="curriculum.view" />}>
              <Route
                path="/curriculum"
                element={<CurriculumManagement />}
              />
            </Route>

            <Route element={<RequirePermission permission="questionBank.view" />}>
              <Route path="/question-bank" element={<QuestionBank />} />
            </Route>

            <Route element={<RequirePermission permission="assessmentTemplates.view" />}>
              <Route path="/assessment-templates" element={<AssessmentTemplates />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
