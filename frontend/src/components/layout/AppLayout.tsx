import { Outlet } from "react-router-dom";
import FeedbackButton from "../feedback/FeedbackButton";
import { TrialGateProvider } from "../../trial/TrialGateContext";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import "./AppLayout.css";

export default function AppLayout() {
  return (
    <TrialGateProvider>
      <div className="sc-app-shell">
        <Sidebar />
        <div className="sc-app-main">
          <TopBar />
          <main className="sc-app-content">
            <Outlet />
          </main>
        </div>
        <FeedbackButton />
      </div>
    </TrialGateProvider>
  );
}
