import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
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
import AssessmentPaperVault from "./pages/assessments/AssessmentPaperVault";
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
import SubjectsManagement from "./pages/subjects/SubjectsManagement";
import RubricsManagement from "./pages/rubrics/RubricsManagement";
import AssessmentSchedule from "./pages/schedule/AssessmentSchedule";
import AssessmentAnalysis from "./pages/analysis/AssessmentAnalysis";
import LearnerHistory from "./pages/learners/LearnerHistory";
import MarkImportWizard from "./pages/marks/MarkImportWizard";
import BulkMarkCapture from "./pages/marks/BulkMarkCapture";
import ConcessionsRegister from "./pages/concessions/ConcessionsRegister";
import { PortalAuthProvider } from "./portal/PortalAuthContext";
import PortalGuard, { PortalGuestGuard } from "./portal/PortalGuard";
import PortalLayout from "./portal/PortalLayout";
import PortalLogin from "./pages/portal/PortalLogin";
import PortalDashboardRouter from "./pages/portal/PortalDashboard";
import PortalAssessmentDetailPage from "./pages/portal/PortalAssessmentDetail";
import PortalHistoryPage from "./pages/portal/PortalHistory";
import PortalAnalyticsPage from "./pages/portal/PortalAnalytics";

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
              <Route path="/assessments/:id/paper-vault" element={<AssessmentPaperVault />} />
              <Route path="/assessments/:id" element={<AssessmentDetail />} />
            </Route>

            <Route element={<RequirePermission permission="results.view" />}>
              <Route path="/assessments/:id/results" element={<AssessmentResults />} />
              <Route path="/assessments/:id/analysis" element={<AssessmentAnalysis />} />
              <Route path="/results" element={<DepartmentResults />} />
              <Route path="/published-results/:assessmentId" element={<PublishedResults />} />
              <Route path="/learners/:learnerId/history" element={<LearnerHistory />} />
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

            <Route element={<RequirePermission permission="subjects.view" />}>
              <Route path="/subjects" element={<SubjectsManagement />} />
            </Route>

            <Route element={<RequirePermission permission="rubrics.view" />}>
              <Route path="/rubrics" element={<RubricsManagement />} />
            </Route>

            <Route element={<RequirePermission permission="schedule.view" />}>
              <Route path="/schedule" element={<AssessmentSchedule />} />
            </Route>

            <Route element={<RequirePermission permission="marks.import" />}>
              <Route path="/assessments/:id/import" element={<MarkImportWizard />} />
              <Route path="/assessments/:id/capture" element={<BulkMarkCapture />} />
            </Route>

            <Route element={<RequirePermission permission="concessions.view" />}>
              <Route path="/concessions" element={<ConcessionsRegister />} />
            </Route>
          </Route>
        </Route>

        <Route
          path="/portal"
          element={
            <PortalAuthProvider>
              <Outlet />
            </PortalAuthProvider>
          }
        >
          <Route element={<PortalGuestGuard />}>
            <Route path="login" element={<PortalLogin />} />
          </Route>
          <Route element={<PortalGuard />}>
            <Route element={<PortalLayout />}>
              <Route index element={<PortalDashboardRouter />} />
              <Route
                path="learners/:learnerId/assessments/:assessmentId"
                element={<PortalAssessmentDetailPage />}
              />
              <Route path="learners/:learnerId/history" element={<PortalHistoryPage />} />
              <Route path="learners/:learnerId/analytics" element={<PortalAnalyticsPage />} />
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
