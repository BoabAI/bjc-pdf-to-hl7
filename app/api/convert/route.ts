import { NextRequest, NextResponse } from "next/server";
import { convertPdf, parseConvertFormData } from "@/lib/convert-service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const parsed = await parseConvertFormData(formData);

    if ("error" in parsed) {
      return NextResponse.json(
        { success: false, error: parsed.error },
        { status: parsed.status }
      );
    }

    return NextResponse.json(await convertPdf(parsed.data));
  } catch (error) {
    console.error("Conversion error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Conversion failed",
      },
      { status: 500 }
    );
  }
}

// Health check endpoint
export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "PDF to HL7 Converter",
    version: "1.0.0",
  });
}
