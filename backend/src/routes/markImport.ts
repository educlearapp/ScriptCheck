import { Router, type Response } from "express";
import multer from "multer";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/requirePermission";
import { PERMISSIONS } from "../services/permissions";
import { auditRequestMeta } from "../services/auditLog";
import {
  executeMarkImport,
  listRecentImports,
  MarkImportError,
  parseSpreadsheet,
  validateImportRows,
  type ColumnMapping,
  type ParsedRow,
} from "../services/markImport";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});

function handleError(res: Response, err: unknown) {
  if (err instanceof MarkImportError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  console.error("[mark-import]", err);
  return res.status(500).json({ error: "Mark import operation failed" });
}

router.post(
  "/assessments/:assessmentId/parse",
  requireAuth,
  requirePermission(PERMISSIONS.MARKS_IMPORT),
  upload.single("file"),
  async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const result = parseSpreadsheet(req.file.buffer, req.file.originalname);
      return res.json(result);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.post(
  "/assessments/:assessmentId/validate",
  requireAuth,
  requirePermission(PERMISSIONS.MARKS_IMPORT),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { rows, mapping } = req.body as {
        rows: ParsedRow[];
        mapping: ColumnMapping;
      };

      if (!rows || !mapping) {
        return res.status(400).json({ error: "rows and mapping are required" });
      }

      const result = await validateImportRows(
        String(req.params.assessmentId),
        req.auth!.workspaceId,
        req.access!,
        rows,
        mapping
      );

      return res.json(result);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.post(
  "/assessments/:assessmentId/import",
  requireAuth,
  requirePermission(PERMISSIONS.MARKS_IMPORT),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { validRows, fileName } = req.body as {
        validRows: Array<{
          row: number;
          learnerId: string;
          learnerNumber: string;
          learnerName: string;
          mark: number;
          comment: string | null;
        }>;
        fileName?: string;
      };

      if (!validRows?.length) {
        return res.status(400).json({ error: "No valid rows to import" });
      }

      const result = await executeMarkImport(
        String(req.params.assessmentId),
        req.auth!.workspaceId,
        req.access!,
        validRows,
        { fileName, ...auditRequestMeta(req) }
      );

      return res.json(result);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

router.get(
  "/recent",
  requireAuth,
  requirePermission(PERMISSIONS.MARKS_IMPORT),
  async (req: AuthenticatedRequest, res) => {
    try {
      const imports = await listRecentImports(
        req.auth!.workspaceId,
        req.auth!.userId,
        req.access!
      );
      return res.json(imports);
    } catch (err) {
      return handleError(res, err);
    }
  }
);

export default router;
