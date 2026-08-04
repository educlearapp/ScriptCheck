import { describe, expect, it } from "vitest";
import { formatPdfRenderError } from "../utils/pdfRenderErrors";
import {
  markingConfirmButtonLabel,
  shouldPrepareMarkingJob,
} from "../utils/markingPrep";
import { extractQuestionsFromPastPaperText } from "../utils/phase1cPaperContract";

describe("pdf renderer error mapping", () => {
  it("hides raw toHex errors from teachers", () => {
    expect(formatPdfRenderError(new Error("a.toHex is not a function"))).toMatch(
      /could not be shown/i
    );
    expect(formatPdfRenderError(new Error("a.toHex is not a function"))).not.toMatch(/toHex/);
  });

  it("keeps ordinary messages readable", () => {
    expect(formatPdfRenderError(new Error("Failed to load page file (404)"))).toMatch(
      /could not be downloaded/i
    );
  });
});

describe("marking-pack preparation branching", () => {
  it("packs prepare; normal assessments skip", () => {
    expect(shouldPrepareMarkingJob(true)).toBe(true);
    expect(shouldPrepareMarkingJob(false)).toBe(false);
    expect(markingConfirmButtonLabel(true)).toBe("Start Marking");
    expect(markingConfirmButtonLabel(false)).toBe("Continue to Marking");
  });
});

describe("phase1c extractable paper contract", () => {
  it("parses numbered questions with marks suffixes", () => {
    const text = [
      "GRADE 6 PHASE 1C TEST PAPER",
      "1. Name the capital city of South Africa. (2)",
      "2. List three primary colours. (3)",
    ].join("\n");
    const qs = extractQuestionsFromPastPaperText(text);
    expect(qs).toEqual([
      { questionNumber: "1", marks: 2, questionText: "Name the capital city of South Africa." },
      { questionNumber: "2", marks: 3, questionText: "List three primary colours." },
    ]);
  });

  it("parses memorandum answer lines", () => {
    const memo = ["MEMORANDUM", "1. Pretoria (2)", "2. Red, blue, yellow (3)"].join("\n");
    const answers = extractQuestionsFromPastPaperText(memo, { memoOnly: true });
    expect(answers).toEqual([
      { questionNumber: "1", answer: "Pretoria (2)" },
      { questionNumber: "2", answer: "Red, blue, yellow (3)" },
    ]);
  });
});
