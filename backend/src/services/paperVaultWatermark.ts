import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

export type WatermarkContext = {
  userName: string;
  role: string;
  assessmentTitle: string;
  versionNumber: number;
  timestamp: Date;
};

/**
 * Applies a footer watermark to PDF bytes. Non-PDF files are returned unchanged.
 */
export async function applyPdfWatermark(
  buffer: Buffer,
  mimeType: string,
  context: WatermarkContext
): Promise<Buffer> {
  if (mimeType !== "application/pdf") {
    return buffer;
  }

  try {
    const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: false });
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const pages = pdfDoc.getPages();
    const line1 = `${context.userName} · ${context.role}`;
    const line2 = `${context.assessmentTitle} · v${context.versionNumber}`;
    const line3 = context.timestamp.toISOString();

    for (const page of pages) {
      const { width } = page.getSize();
      const fontSize = 8;
      const y = 18;
      page.drawText(line1, {
        x: 24,
        y: y + 14,
        size: fontSize,
        font,
        color: rgb(0.45, 0.45, 0.45),
      });
      page.drawText(line2, {
        x: 24,
        y,
        size: fontSize,
        font,
        color: rgb(0.45, 0.45, 0.45),
      });
      page.drawText(line3, {
        x: width - 180,
        y,
        size: fontSize,
        font,
        color: rgb(0.45, 0.45, 0.45),
      });
    }

    const bytes = await pdfDoc.save();
    return Buffer.from(bytes);
  } catch {
    return buffer;
  }
}
