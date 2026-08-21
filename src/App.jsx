import { BrowserRouter, Routes, Route } from "react-router-dom";

import Home from "./pages/public/Home/Home";
import BrowseJobs from "./pages/public/BrowseJobs";
import HowItWorks from "./pages/public/HowItWorks";
import ForEmployers from "./pages/public/ForEmployers";
import AboutUs from "./pages/public/AboutUs";

import SignIn from "./pages/auth/SignIn";
import SignUp from "./pages/auth/SignUp";
import AdminLogin from "./pages/auth/AdminLogin";
import ForgotPassword from "./pages/auth/ForgotPassword";
import ResetPassword from "./pages/auth/ResetPassword";

import CandidateDashboard from "./pages/candidate/CandidateDashboard";
import Resume from "./pages/candidate/Resume";
import JobMatches from "./pages/candidate/JobMatches";
import AIJobMatches from "./pages/candidate/AIJobMatches";
import Applications from "./pages/candidate/Applications";
import Profile from "./pages/candidate/Profile";

import EmployerDashboard from "./pages/employer/EmployerDashboard";
import ManageJobs from "./pages/employer/ManageJobs";
import PostJob from "./pages/employer/PostJob";
import Applicants from "./pages/employer/Applicants";
import InterviewCenter from "./pages/employer/InterviewCenter";
import HiringDecisions from "./pages/employer/HiringDecisions";
import HiringRecords from "./pages/employer/HiringRecords";
import HiringPipeline from "./pages/employer/HiringPipeline";
import CompanyProfile from "./pages/employer/CompanyProfile";

import AdminDashboard from "./pages/admin/AdminDashboard";
import ManageUsers from "./pages/admin/ManageUsers";
import ManageJobseekers from "./pages/admin/ManageJobseekers";
import AdminManageJobs from "./pages/admin/AdminManageJobs";
import ManageEmployers from "./pages/admin/ManageEmployers";
import SuspendedAccounts from "./pages/admin/SuspendedAccounts";
import Reports from "./pages/admin/Reports";
import AdminAuditLogs from "./pages/admin/AdminAuditLogs";
import ManageResumes from "./pages/admin/ManageResumes";
import AdminManageApplications from "./pages/admin/AdminManageApplications";
import AdminProfile from "./pages/admin/AdminProfile";

import Unauthorized from "./pages/errors/Unauthorized";
import NotFound from "./pages/errors/NotFound";
import AccountSuspended from "./pages/errors/AccountSuspended";

import RoleRoute from "./components/guards/RoleRoute";
import { ROLES } from "./utils/roles";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public pages */}
        <Route path="/" element={<Home />} />
        <Route path="/browse-jobs" element={<BrowseJobs />} />
        <Route path="/how-it-works" element={<HowItWorks />} />
        <Route path="/for-employers" element={<ForEmployers />} />
        <Route path="/about" element={<AboutUs />} />

        {/* Auth pages */}
        <Route path="/sign-in" element={<SignIn />} />
        <Route path="/sign-up" element={<SignUp />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* Candidate pages */}
        <Route
          path="/candidate/dashboard"
          element={
            <RoleRoute allowedRoles={[ROLES.CANDIDATE]}>
              <CandidateDashboard />
            </RoleRoute>
          }
        />

        <Route
          path="/candidate/resume"
          element={
            <RoleRoute allowedRoles={[ROLES.CANDIDATE]}>
              <Resume />
            </RoleRoute>
          }
        />

        <Route
          path="/candidate/jobs"
          element={
            <RoleRoute allowedRoles={[ROLES.CANDIDATE]}>
              <JobMatches />
            </RoleRoute>
          }
        />

        <Route
          path="/candidate/ai-matches"
          element={
            <RoleRoute allowedRoles={[ROLES.CANDIDATE]}>
              <AIJobMatches />
            </RoleRoute>
          }
        />

        <Route
          path="/candidate/applications"
          element={
            <RoleRoute allowedRoles={[ROLES.CANDIDATE]}>
              <Applications />
            </RoleRoute>
          }
        />

        <Route
          path="/candidate/profile"
          element={
            <RoleRoute allowedRoles={[ROLES.CANDIDATE]}>
              <Profile />
            </RoleRoute>
          }
        />

        {/* Employer pages */}
        <Route
          path="/employer/dashboard"
          element={
            <RoleRoute allowedRoles={[ROLES.EMPLOYER]}>
              <EmployerDashboard />
            </RoleRoute>
          }
        />

        <Route
          path="/employer/jobs"
          element={
            <RoleRoute allowedRoles={[ROLES.EMPLOYER]}>
              <ManageJobs />
            </RoleRoute>
          }
        />

        <Route
          path="/employer/post-job"
          element={
            <RoleRoute allowedRoles={[ROLES.EMPLOYER]}>
              <PostJob />
            </RoleRoute>
          }
        />

        <Route
          path="/employer/applicants"
          element={
            <RoleRoute allowedRoles={[ROLES.EMPLOYER]}>
              <Applicants />
            </RoleRoute>
          }
        />

        <Route
          path="/employer/interviews"
          element={
            <RoleRoute allowedRoles={[ROLES.EMPLOYER]}>
              <InterviewCenter />
            </RoleRoute>
          }
        />

        <Route
          path="/employer/hiring-decisions"
          element={
            <RoleRoute allowedRoles={[ROLES.EMPLOYER]}>
              <HiringDecisions />
            </RoleRoute>
          }
        />

        <Route
          path="/employer/hiring-records"
          element={
            <RoleRoute allowedRoles={[ROLES.EMPLOYER]}>
              <HiringRecords />
            </RoleRoute>
          }
        />

        <Route
          path="/employer/hiring-pipeline"
          element={
            <RoleRoute allowedRoles={[ROLES.EMPLOYER]}>
              <HiringRecords />
            </RoleRoute>
          }
        />

        <Route
          path="/employer/company"
          element={
            <RoleRoute allowedRoles={[ROLES.EMPLOYER]}>
              <CompanyProfile />
            </RoleRoute>
          }
        />

        <Route
          path="/employer/company-profile"
          element={
            <RoleRoute allowedRoles={[ROLES.EMPLOYER]}>
              <CompanyProfile />
            </RoleRoute>
          }
        />

        {/* Admin pages */}
        <Route
          path="/admin/dashboard"
          element={
            <RoleRoute allowedRoles={[ROLES.ADMIN]}>
              <AdminDashboard />
            </RoleRoute>
          }
        />

        <Route
          path="/admin/users"
          element={
            <RoleRoute allowedRoles={[ROLES.ADMIN]}>
              <ManageUsers />
            </RoleRoute>
          }
        />

        <Route
          path="/admin/jobseekers"
          element={
            <RoleRoute allowedRoles={[ROLES.ADMIN]}>
              <ManageJobseekers />
            </RoleRoute>
          }
        />

        <Route
          path="/admin/jobs"
          element={
            <RoleRoute allowedRoles={[ROLES.ADMIN]}>
              <AdminManageJobs />
            </RoleRoute>
          }
        />

        <Route
          path="/admin/employers"
          element={
            <RoleRoute allowedRoles={[ROLES.ADMIN]}>
              <ManageEmployers />
            </RoleRoute>
          }
        />

        <Route
          path="/admin/suspended-accounts"
          element={
            <RoleRoute allowedRoles={[ROLES.ADMIN]}>
              <SuspendedAccounts />
            </RoleRoute>
          }
        />

        <Route
          path="/admin/resumes"
          element={
            <RoleRoute allowedRoles={[ROLES.ADMIN]}>
              <ManageResumes />
            </RoleRoute>
          }
        />

        <Route
          path="/admin/applications"
          element={
            <RoleRoute allowedRoles={[ROLES.ADMIN]}>
              <AdminManageApplications />
            </RoleRoute>
          }
        />

        <Route
          path="/admin/reports"
          element={
            <RoleRoute allowedRoles={[ROLES.ADMIN]}>
              <Reports />
            </RoleRoute>
          }
        />

        <Route
          path="/admin/audit-logs"
          element={
            <RoleRoute allowedRoles={[ROLES.ADMIN]}>
              <AdminAuditLogs />
            </RoleRoute>
          }
        />

        <Route
          path="/admin/profile"
          element={
            <RoleRoute allowedRoles={[ROLES.ADMIN]}>
              <AdminProfile />
            </RoleRoute>
          }
        />

        {/* Error & Notice pages */}
        <Route path="/account-suspended" element={<AccountSuspended />} />
        <Route path="/unauthorized" element={<Unauthorized />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;