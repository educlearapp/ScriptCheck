import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import "./AppLayout.css";

export default function AppLayout() {
  return (
    <div className="sc-app-shell">
      <Sidebar />
      <div className="sc-app-main">
        <TopBar />
        <main className="sc-app-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
