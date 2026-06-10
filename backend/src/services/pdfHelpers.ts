import PDFDocument from "pdfkit";

export const PDF_GOLD = "#d4af37";
export const PDF_DARK = "#1a1a1a";
export const PDF_MUTED = "#666666";

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
  doc.rect(0, 0, doc.page.width, 80).fill(PDF_DARK);
  doc.fillColor(PDF_GOLD).fontSize(22).font("Helvetica-Bold");
  doc.text("ScriptCheck", 50, 24);
  doc.fillColor("#ffffff").fontSize(14).font("Helvetica-Bold");
  doc.text(title, 50, 48);
  if (subtitle) {
    doc.fillColor("#cccccc").fontSize(9).font("Helvetica");
    doc.text(subtitle, 50, 66);
  }
  doc.fillColor("#000000");
  doc.y = 100;
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
