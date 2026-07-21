import { describe, expect, test } from "bun:test";
import { MAX_PDF_SIZE_BYTES } from "../conversion-config";
import { parseConvertFormData } from "./form-data";

function pdfFile(content = "%PDF-1.4 fake", name = "result.pdf"): File {
  return new File([content], name, { type: "application/pdf" });
}

describe("parseConvertFormData", () => {
  test("parses a valid conversion request", async () => {
    const formData = new FormData();
    formData.set("pdf", pdfFile());
    formData.set("documentType", "pathology_result");
    formData.set("autoFile", "false");
    formData.set("orderingProvider", "9000001Z");
    formData.set("carrier", "EMAIL");
    formData.set("bjcDoctors", JSON.stringify(["Dr X", "Dr Y"]));

    const parsed = await parseConvertFormData(formData);

    expect(parsed).toMatchObject({
      originalFilename: "result.pdf",
      data: {
        detectOnly: false,
        documentType: "pathology_result",
        autoFile: false,
        orderingProvider: "9000001Z",
        carrier: "EMAIL",
        bjcDoctors: ["Dr X", "Dr Y"],
      },
    });
    if ("data" in parsed) {
      expect(parsed.data.pdfBuffer.toString()).toBe("%PDF-1.4 fake");
    }
  });

  test("falls back to environment doctors when form doctor JSON is invalid", async () => {
    const formData = new FormData();
    formData.set("pdf", pdfFile());
    formData.set("bjcDoctors", "{bad json");

    const parsed = await parseConvertFormData(formData, "Dr A, Dr B");

    expect("data" in parsed ? parsed.data.bjcDoctors : undefined).toEqual([
      "Dr A",
      "Dr B",
    ]);
  });

  test("sanitises orderingProvider — drops HL7-separator and over-length values", async () => {
    const hostile = new FormData();
    hostile.set("pdf", pdfFile());
    // A crafted value carrying an HL7 component separator must not reach PV1-9.
    hostile.set("orderingProvider", "1234567^EVIL");
    const parsed = await parseConvertFormData(hostile);
    expect("data" in parsed ? parsed.data.orderingProvider : "x").toBeUndefined();

    const tooLong = new FormData();
    tooLong.set("pdf", pdfFile());
    tooLong.set("orderingProvider", "9".repeat(21));
    const parsedLong = await parseConvertFormData(tooLong);
    expect("data" in parsedLong ? parsedLong.data.orderingProvider : "x").toBeUndefined();
  });

  test("rejects missing, non-PDF, and oversize files", async () => {
    expect(await parseConvertFormData(new FormData())).toEqual({
      error: "No PDF file provided",
      status: 400,
    });

    const nonPdf = new FormData();
    nonPdf.set("pdf", new File(["x"], "notes.txt", { type: "text/plain" }));
    expect(await parseConvertFormData(nonPdf)).toEqual({
      error: "File must be a PDF",
      status: 400,
    });

    const oversize = new FormData();
    oversize.set(
      "pdf",
      new File([new Uint8Array(MAX_PDF_SIZE_BYTES + 1)], "large.pdf", {
        type: "application/pdf",
      })
    );
    expect(await parseConvertFormData(oversize)).toEqual({
      error: "File size exceeds 10MB limit",
      status: 400,
    });
  });
});
