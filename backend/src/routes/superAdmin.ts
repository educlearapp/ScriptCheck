import { Router } from "express";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { requireSuperAdmin } from "../middleware/requireSuperAdmin";
import {
  getSuperAdminOverview,
  listSuperAdminUsers,
  listSuperAdminWorkspaces,
} from "../services/superAdminMonitoring";

const router = Router();

router.use(requireAuth, requireSuperAdmin);

router.get("/overview", async (_req: AuthenticatedRequest, res) => {
  try {
    const overview = await getSuperAdminOverview();
    return res.json(overview);
  } catch (err) {
    console.error("[super-admin/overview]", err);
    return res.status(500).json({ error: "Failed to load overview" });
  }
});

router.get("/workspaces", async (req: AuthenticatedRequest, res) => {
  try {
    const workspaces = await listSuperAdminWorkspaces({
      search: req.query.search ? String(req.query.search) : undefined,
      trialStatus: req.query.trialStatus
        ? String(req.query.trialStatus)
        : undefined,
      active: req.query.active ? String(req.query.active) : undefined,
    });
    return res.json({ workspaces });
  } catch (err) {
    console.error("[super-admin/workspaces]", err);
    return res.status(500).json({ error: "Failed to load workspaces" });
  }
});

router.get("/users", async (req: AuthenticatedRequest, res) => {
  try {
    const users = await listSuperAdminUsers({
      search: req.query.search ? String(req.query.search) : undefined,
      workspaceSearch: req.query.workspaceSearch
        ? String(req.query.workspaceSearch)
        : undefined,
      role: req.query.role ? String(req.query.role) : undefined,
      active: req.query.active ? String(req.query.active) : undefined,
      trialStatus: req.query.trialStatus
        ? String(req.query.trialStatus)
        : undefined,
    });
    return res.json({ users });
  } catch (err) {
    console.error("[super-admin/users]", err);
    return res.status(500).json({ error: "Failed to load users" });
  }
});

export default router;
