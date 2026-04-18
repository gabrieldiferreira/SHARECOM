import { NextRequest, NextResponse } from "next/server";
import { getServerApiUrl } from "../../../lib/api";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.redirect(new URL("/?error=Unauthorized", req.url), 303);
    }

    const formData = await req.formData();
    const receiptFile = formData.get("receipt");

    if (!receiptFile || !(receiptFile instanceof Blob)) {
      return NextResponse.redirect(new URL("/?error=NoReceiptProvided", req.url), 303);
    }

    // Forward the file directly to the backend FastAPI server
    const backendFormData = new FormData();
    backendFormData.append("received_file", receiptFile, (receiptFile as File).name || "shared.jpg");

    const response = await fetch(getServerApiUrl("/receipts"), {
      method: "POST",
      headers: { Authorization: authHeader },
      body: backendFormData,
    });

    if (!response.ok) {
      console.error("Backend failed to receive receipt", await response.text());
      return NextResponse.redirect(new URL("/?error=BackendUploadFailed", req.url), 303);
    }

    const data = await response.json();
    const receiptFilename = data.filename;
    const ai = data.ai_data || {};

    // Instead of leaking data via URL, post directly to the backend database
    const expensePayload = {
      amount: ai.total_amount || 0,
      category: ai.smart_category || 'Outros',
      merchant: ai.merchant_name || 'Desconhecido',
      receipt: receiptFilename,
      transaction_type: ai.transaction_type || 'Outflow',
      payment_method: ai.payment_method || 'Comprovante',
      destination_institution: ai.destination_institution || undefined,
      transaction_id: ai.transaction_id || undefined,
      masked_cpf: ai.masked_cpf || undefined,
      date: ai.transaction_date || new Date().toISOString()
    };

    const saveResponse = await fetch(getServerApiUrl("/expenses"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify(expensePayload)
    });

    if (!saveResponse.ok) {
      console.error("Failed to save shared expense to DB", await saveResponse.text());
      return NextResponse.redirect(new URL("/?error=DatabaseSaveFailed", req.url), 303);
    }

    // Clean redirect, triggering the dashboard to simply fetch the latest state
    return NextResponse.redirect(new URL("/?shared=success", req.url), 303);
  } catch (error) {
    console.error("Share target processing failed:", error);
    return NextResponse.redirect(new URL("/?error=ShareProcessingFailed", req.url), 303);
  }
}
