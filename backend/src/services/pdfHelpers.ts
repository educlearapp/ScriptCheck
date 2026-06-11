import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";

export const PDF_GOLD = "#d4af37";
export const PDF_DARK = "#1c1c1e";
export const PDF_MUTED = "#666666";

const LOGO_CANDIDATES = [
  path.join(__dirname, "../../assets/scriptcheck-logo.png"),
  path.join(process.cwd(), "assets/scriptcheck-logo.png"),
  path.join(process.cwd(), "backend/assets/scriptcheck-logo.png"),
];

function resolveLogoPath(): string | null {
  for (const candidate of LOGO_CANDIDATES) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

export function pdfBuffer(build: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    build(doc);
    doc.end();
  });
}

export function drawPdfHeader(doc: PDFKit.PDFDocument, title: string, subtitle?: string) {
  const headerHeight = 88;
  doc.rect(0, 0, doc.page.width, headerHeight).fill(PDF_DARK);

  const logoPath = resolveLogoPath();
  const textX = logoPath ? 108 : 50;

  if (logoPath) {
    try {
      doc.image(logoPath, 42, 10, { width: 56 });
    } catch {
      doc.fillColor(PDF_GOLD).fontSize(22).font("Helvetica-Bold");
      doc.text("ScriptCheck", 50, 24);
    }
  } else {
    doc.fillColor(PDF_GOLD).fontSize(22).font("Helvetica-Bold");
    doc.text("ScriptCheck", 50, 24);
  }

  doc.fillColor(PDF_GOLD).fontSize(10).font("Helvetica");
  doc.text("Assessment Intelligence", textX, 22, { lineBreak: false });
  doc.fillColor("#ffffff").fontSize(13).font("Helvetica-Bold");
  doc.text(title, textX, 40, { width: doc.page.width - textX - 50 });
  if (subtitle) {
    doc.fillColor("#cccccc").fontSize(9).font("Helvetica");
    doc.text(subtitle, textX, 58, { width: doc.page.width - textX - 50 });
  }

  doc
    .strokeColor(PDF_GOLD)
    .lineWidth(1)
    .moveTo(42, headerHeight - 4)
    .lineTo(doc.page.width - 42, headerHeight - 4)
    .stroke();

  doc.fillColor("#000000");
  doc.y = headerHeight + 16;
}

export function drawSectionTitle(doc: PDFKit.PDFDocument, title: string) {
  doc.moveDown(0.5);
  doc.fillColor(PDF_GOLD).fontSize(12).font("Helvetica-Bold").text(title);
  doc.fillColor("#000000").moveDown(0.3);
}

export function ensurePdfSpace(doc: PDFKit.PDFDocument, needed = 60) {
  if (doc.y + needed > doc.page.height - 60) {
    doc.addPage();
    doc.y = 50;
  }
}

export function formatPct(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${value}%`;
}
