import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import AuthGuard from "./auth/AuthGuard";
import GuestGuard from "./auth/GuestGuard";
import PublicHomeRoute from "./auth/PublicHomeRoute";
import RequirePermission from "./auth/RequirePermission";
import RequireSuperAdmin from "./auth/RequireSuperAdmin";
import AppLayout from "./components/layout/AppLayout";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import TrialRegister from "./pages/TrialRegister";
import PublicLayout from "./components/layout/PublicLayout";
import DashboardRouter from "./pages/dashboard/DashboardRouter";
import PrincipalDashboard from "./pages/dashboard/PrincipalDashboard";
import HodDashboard from "./pages/dashboard/HodDashboard";
import TeacherDashboard from "./pages/dashboard/TeacherDashboard";
import ExamBodyDashboard from "./pages/dashboard/ExamBodyDashboard";
import ModeratorDashboard from "./pages/dashboard/ModeratorDashboard";
import ReportsAnalytics from "./pages/reports/ReportsAnalytics";
import MarkingWorkbench from "./pages/marking/MarkingWorkbench";
import SettingsPage from "./pages/settings/SettingsPage";
import WorkflowSettings from "./pages/settings/WorkflowSettings";
import SubscriptionSettings from "./pages/settings/SubscriptionSettings";
import BetaFeedbackPage from "./pages/settings/BetaFeedbackPage";
import BetaChecklistPage from "./pages/settings/BetaChecklistPage";
import AssessmentsList from "./pages/assessments/AssessmentsList";
import CreateAssessment from "./pages/assessments/CreateAssessment";
import GenerateAssessment from "./pages/assessments/GenerateAssessment";
import AiAssessmentBuilder from "./pages/assessments/AiAssessmentBuilder";
import GenerationPreview from "./pages/assessments/GenerationPreview";
import AssessmentDetail from "./pages/assessments/AssessmentDetail";
import AssessmentPaperVault from "./pages/assessments/AssessmentPaperVault";
import AssessmentResults from "./pages/assessments/AssessmentResults";
import AssessmentScripts from "./pages/scripts/AssessmentScripts";
import ScriptVerification from "./pages/scripts/ScriptVerification";
import AssessmentSetupWizard from "./pages/assessments/AssessmentSetupWizard";
import LearnerScriptDetail from "./pages/scripts/LearnerScriptDetail";
import QuestionBank from "./pages/questionBank/QuestionBank";
import AssessmentTemplates from "./pages/templates/AssessmentTemplates";
import UsersRolesPlaceholder from "./pages/users/UsersRolesPlaceholder";
import CurriculumManagement from "./pages/curriculum/CurriculumManagement";
import HodModerationQueue from "./pages/moderation/HodModerationQueue";
import EscalationCentre from "./pages/moderation/EscalationCentre";
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
import InterventionsPage from "./pages/interventions/InterventionsPage";
import ExaminationDashboard from "./pages/examinations/ExaminationDashboard";
import ExaminationTimetablePage from "./pages/examinations/ExaminationTimetable";
import ExaminationSessionsPage from "./pages/examinations/ExaminationSessions";
import ExaminationInvigilatorsPage from "./pages/examinations/ExaminationInvigilators";
import ExaminationSeatingPage from "./pages/examinations/ExaminationSeating";
import ExaminationPacksPage from "./pages/examinations/ExaminationPacks";
import ExaminationIncidentsPage from "./pages/examinations/ExaminationIncidents";
import ClassesManagement from "./pages/timetable/ClassesManagement";
import RoomsManagement from "./pages/timetable/RoomsManagement";
import TimetableSetup from "./pages/timetable/TimetableSetup";
import TeacherAssignmentsPage from "./pages/timetable/TeacherAssignments";
import SubjectRequirementsPage from "./pages/timetable/SubjectRequirements";
import LessonTimetableList from "./pages/timetable/LessonTimetableList";
import LessonTimetableBuilder from "./pages/timetable/LessonTimetableBuilder";
import ClassTimetableView from "./pages/timetable/ClassTimetableView";
import TeacherTimetableView from "./pages/timetable/TeacherTimetableView";
import RoomTimetableView from "./pages/timetable/RoomTimetableView";
import ModerationEntry from "./pages/moderation/ModerationEntry";
import SuperAdminPage from "./pages/superAdmin/SuperAdminPage";
import { PortalAuthProvider } from "./portal/PortalAuthContext";
import PortalGuard, { PortalGuestGuard } from "./portal/PortalGuard";
import PortalLayout from "./portal/PortalLayout";
import PortalLogin from "./pages/portal/PortalLogin";
import PortalDashboardRouter from "./pages/portal/PortalDashboard";
import PortalAssessmentDetailPage from "./pages/portal/PortalAssessmentDetail";
import PortalHistoryPage from "./pages/portal/PortalHistory";
import PortalAnalyticsPage from "./pages/portal/PortalAnalytics";

function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public marketing + auth pages — never wrapped in AppLayout/Sidebar */}
        <Route element={<PublicLayout />}>
          <Route index element={<PublicHomeRoute />} />
          <Route element={<GuestGuard />}>
            <Route path="login" element={<Login />} />
            <Route path="register" element={<Register />} />
            <Route path="trial" element={<TrialRegister />} />
            <Route path="forgot-password" element={<ForgotPassword />} />
          </Route>
        </Route>

        {/* Authenticated application shell */}
        <Route element={<AuthGuard />}>
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<DashboardRouter />} />
            <Route path="/dashboard/principal" element={<PrincipalDashboard />} />
            <Route path="/dashboard/hod" element={<HodDashboard />} />
            <Route path="/dashboard/exam-body" element={<ExamBodyDashboard />} />
            <Route path="/dashboard/moderator" element={<ModeratorDashboard />} />
            <Route path="/dashboard/teacher" element={<TeacherDashboard />} />

            <Route element={<RequirePermission permission="dashboard.academic.view" />}>
              <Route path="/reports" element={<ReportsAnalytics />} />
            </Route>

            <Route element={<RequirePermission permission="assessments.view" />}>
              <Route path="/marking" element={<MarkingWorkbench />} />
            </Route>

            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/settings/workflow" element={<WorkflowSettings />} />
            <Route path="/settings/subscription" element={<SubscriptionSettings />} />
            <Route path="/settings/beta-checklist" element={<BetaChecklistPage />} />
            <Route element={<RequirePermission permission="betaFeedback.view" />}>
              <Route path="/settings/beta-feedback" element={<BetaFeedbackPage />} />
            </Route>

            <Route element={<RequirePermission permission="examinations.view" />}>
              <Route path="/dashboard/examinations" element={<ExaminationDashboard />} />
              <Route path="/examinations/timetable" element={<ExaminationTimetablePage />} />
              <Route path="/examinations/sessions" element={<ExaminationSessionsPage />} />
              <Route path="/examinations/invigilators" element={<ExaminationInvigilatorsPage />} />
              <Route path="/examinations/seating" element={<ExaminationSeatingPage />} />
              <Route path="/examinations/packs" element={<ExaminationPacksPage />} />
              <Route path="/examinations/incidents" element={<ExaminationIncidentsPage />} />
            </Route>

            <Route path="/moderation" element={<ModerationEntry />} />

            <Route element={<RequirePermission permission="moderation.queue" />}>
              <Route path="/moderation/queue" element={<HodModerationQueue />} />
              <Route path="/moderation/escalations" element={<EscalationCentre />} />
            </Route>

            <Route element={<RequirePermission permission="assessments.view" />}>
              <Route path="/assessments" element={<AssessmentsList />} />
              <Route path="/assessments/:id/setup" element={<AssessmentSetupWizard />} />
              <Route path="/assessments/:id/scripts/verify/:batchId" element={<ScriptVerification />} />
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
              <Route path="/interventions" element={<InterventionsPage />} />
            </Route>

            <Route element={<RequirePermission permission="scripts.view" />}>
              <Route path="/scripts/:scriptId" element={<LearnerScriptDetail />} />
              <Route path="/script-batches/:batchId/analytics" element={<BatchModerationDashboard />} />
            </Route>

            <Route element={<RequirePermission permission="assessments.create" />}>
              <Route path="/ai-assessment-builder" element={<AiAssessmentBuilder />} />
              <Route path="/ai-assessment-builder/:requestId" element={<AiAssessmentBuilder />} />
              <Route path="/assessments/new" element={<CreateAssessment />} />
              <Route path="/assessments/generate" element={<GenerateAssessment />} />
              <Route
                path="/assessments/generate/:requestId"
                element={<GenerationPreview />}
              />
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

            <Route element={<RequirePermission permission="timetable.view" />}>
              <Route path="/timetable/classes" element={<ClassesManagement />} />
              <Route path="/timetable/rooms" element={<RoomsManagement />} />
              <Route path="/timetable/setup" element={<TimetableSetup />} />
              <Route path="/timetable/teacher-assignments" element={<TeacherAssignmentsPage />} />
              <Route path="/timetable/subject-requirements" element={<SubjectRequirementsPage />} />
              <Route path="/timetable/lessons" element={<LessonTimetableList />} />
              <Route path="/timetable/lessons/:id/builder" element={<LessonTimetableBuilder />} />
              <Route path="/timetable/lessons/:id/view/class/:classId" element={<ClassTimetableView />} />
              <Route path="/timetable/lessons/:id/view/teacher/:teacherId" element={<TeacherTimetableView />} />
              <Route path="/timetable/lessons/:id/view/room/:roomId" element={<RoomTimetableView />} />
            </Route>

            <Route element={<RequirePermission permission="marks.import" />}>
              <Route path="/assessments/:id/import" element={<MarkImportWizard />} />
              <Route path="/assessments/:id/capture" element={<BulkMarkCapture />} />
            </Route>

            <Route element={<RequirePermission permission="concessions.view" />}>
              <Route path="/concessions" element={<ConcessionsRegister />} />
            </Route>

            <Route element={<RequireSuperAdmin />}>
              <Route path="/super-admin" element={<SuperAdminPage />} />
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
