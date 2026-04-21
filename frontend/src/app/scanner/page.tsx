"use client";

import React, { useState, useRef, useCallback } from "react";
import { Camera, Upload, X, Loader2, CheckCircle2, AlertTriangle, RotateCcw, Save, ChevronLeft, FileText, ImageIcon, Pencil } from "lucide-react";
import { getApiUrl } from "../../lib/api";
import { authenticatedFetch } from "../../lib/auth";
import { useTransactionStore } from "../../store/useTransactionStore";
import { TransactionEntity } from "../../lib/db";
import Link from "next/link";

type ScanStep = "capture" | "preview" | "processing" | "result" | "error";

interface ExtractedData {
  total_amount: number;
  merchant_name: string;
  smart_category: string;
  transaction_date: string;
  transaction_type: "Inflow" | "Outflow";
  payment_method: string;
  description?: string;
  destination_institution?: string;
  transaction_id?: string;
  masked_cpf?: string;
  needs_manual_review?: boolean;
}

export default function ScannerPage() {
  const { addTransaction } = useTransactionStore();
  const [step, setStep] = useState<ScanStep>("capture");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [editData, setEditData] = useState<ExtractedData | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [note, setNote] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [idempotent, setIdempotent] = useState(false);
  const [savedId, setSavedId] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const resetAll = useCallback(() => {
    setStep("capture");
    setSelectedFile(null);
    setPreviewUrl(null);
    setExtractedData(null);
    setEditData(null);
    setIsEditing(false);
    setNote("");
    setErrorMsg("");
    setIdempotent(false);
    setSavedId(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setStep("preview");
  };

  const processReceipt = async () => {
    if (!selectedFile) return;

    setStep("processing");
    const formData = new FormData();
    formData.append("received_file", selectedFile, selectedFile.name);
    if (note.trim()) {
      formData.append("note", note.trim());
    }

    try {
      const response = await authenticatedFetch(getApiUrl("/process-ata"), {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        const ai = data.ai_data || {};

        const extracted: ExtractedData = {
          total_amount: ai.total_amount || 0,
          merchant_name: ai.merchant_name || "Desconhecido",
          smart_category: ai.smart_category || "Outros",
          transaction_date: ai.transaction_date || new Date().toISOString(),
          transaction_type: ai.transaction_type || "Outflow",
          payment_method: ai.payment_method || "Desconhecido",
          description: ai.description,
          destination_institution: ai.destination_institution,
          transaction_id: ai.transaction_id,
          masked_cpf: ai.masked_cpf,
          needs_manual_review: ai.needs_manual_review,
        };

        setExtractedData(extracted);
        setEditData({ ...extracted });
        setIdempotent(!!data.idempotent);
        setSavedId(data.database_id || null);

        if (!data.idempotent) {
          const newTx: TransactionEntity = {
            total_amount: extracted.total_amount,
            merchant_name: extracted.merchant_name,
            category: extracted.smart_category,
            currency: "BRL",
            transaction_date: extracted.transaction_date,
            transaction_type: extracted.transaction_type,
            payment_method: extracted.payment_method,
            description: extracted.description,
            destination_institution: extracted.destination_institution,
            transaction_id: extracted.transaction_id,
            masked_cpf: extracted.masked_cpf,
            needs_manual_review: extracted.needs_manual_review,
            receipt_hash: data.filename,
            is_synced: false,
            note: data.note || undefined,
          };
          await addTransaction(newTx);
        }

        setStep("result");
      } else {
        if (response.status === 401) {
          setErrorMsg("Sua sessão expirou. Faça login novamente.");
          setStep("error");
          return;
        }
        const errorText = await response.text();
        let msg = errorText || "Falha no servidor.";
        try {
          const errObj = JSON.parse(errorText);
          if (errObj.detail) msg = errObj.detail;
        } catch {}
        setErrorMsg(msg);
        setStep("error");
      }
    } catch (e) {
      console.error("Scan error:", e);
      if (e instanceof Error && e.message === "AUTH_REQUIRED") {
        setErrorMsg("Você precisa estar autenticado para escanear recibos.");
      } else {
        setErrorMsg("Erro de conexão com o servidor. Verifique se o backend está ativo.");
      }
      setStep("error");
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateStr;
    }
  };

  /* ─── CAPTURE STEP ─── */
  if (step === "capture") {
    return (
      <div className="h-full flex flex-col hero-gradient">
        {/* Header */}
        <div className="flex items-center gap-3 p-4" style={{ borderBottom: "0.5px solid var(--ds-border)" }}>
          <Link href="/" className="p-1.5 rounded-md transition-colors" style={{ color: "var(--text-secondary)" }}>
            <ChevronLeft size={20} />
          </Link>
          <h1 className="text-base font-medium" style={{ color: "var(--text-primary)" }}>Escanear Comprovante</h1>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6 relative">
          {/* Camera Viewfinder Placeholder */}
          <div className="relative w-72 h-96 flex items-center justify-center">
            <div className="absolute inset-0 rounded-3xl border-4 border-fuchsia-500/60 bg-black/20 flex items-center justify-center">
              <div className="w-48 h-48 rounded-2xl border-4 border-fuchsia-500/80 bg-transparent" style={{ boxShadow: '0 0 0 9999px rgba(0,0,0,0.2) inset' }} />
            </div>
            <Camera size={48} className="text-fuchsia-500 z-10" />
          </div>

          {/* Large Capture Button */}
          <button
            onClick={() => cameraInputRef.current?.click()}
            className="absolute bottom-12 left-1/2 -translate-x-1/2 w-20 h-20 rounded-full bg-gradient-to-br from-purple-500 to-fuchsia-500 flex items-center justify-center shadow-lg border-4 border-white/30 hover:scale-105 active:scale-95 transition-all"
            style={{ backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)' }}
          >
            <Camera size={32} className="text-white" />
          </button>

          {/* Hidden file inputs */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileSelect}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf"
            className="hidden"
            onChange={handleFileSelect}
          />
        </div>
      </div>
    );
  }

  /* ─── PREVIEW STEP ─── */
  if (step === "preview") {
    const isImage = selectedFile?.type.startsWith("image/");
    return (
      <div className="h-full flex flex-col" style={{ backgroundColor: "var(--bg-primary)" }}>
        <div className="flex items-center justify-between p-4" style={{ borderBottom: "0.5px solid var(--ds-border)" }}>
          <div className="flex items-center gap-3">
            <button onClick={resetAll} className="p-1.5 rounded-md" style={{ color: "var(--text-secondary)" }}>
              <ChevronLeft size={20} />
            </button>
            <h1 className="text-base font-medium" style={{ color: "var(--text-primary)" }}>Revisar Imagem</h1>
          </div>
          <button onClick={resetAll} className="p-1.5 rounded-md" style={{ color: "var(--text-secondary)" }}>
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center p-4 gap-4 overflow-auto">
          {/* Image preview */}
          <div
            className="relative w-full max-w-md overflow-hidden"
            style={{ borderRadius: "8px", border: "0.5px solid var(--ds-border)", backgroundColor: "var(--bg-secondary)" }}
          >
            {isImage && previewUrl ? (
              <img
                src={previewUrl}
                alt="Comprovante"
                className="w-full h-auto max-h-[50vh] object-contain"
              />
            ) : (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <FileText size={48} style={{ color: "var(--text-tertiary)" }} />
                <p style={{ fontSize: "13px", color: "var(--text-secondary)" }}>{selectedFile?.name}</p>
              </div>
            )}
          </div>

          {/* File info */}
          <div className="text-center" style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
            {selectedFile?.name} • {selectedFile ? (selectedFile.size / 1024).toFixed(0) : 0} KB
          </div>

          {/* Note */}
          {note && (
            <div className="px-3 py-2 w-full max-w-md" style={{ backgroundColor: "var(--bg-secondary)", borderRadius: "6px", fontSize: "12px", color: "var(--text-secondary)" }}>
              <span style={{ color: "var(--text-tertiary)" }}>Nota: </span>{note}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="p-4 flex gap-3" style={{ borderTop: "0.5px solid var(--ds-border)" }}>
          <button
            onClick={resetAll}
            className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors"
            style={{
              backgroundColor: "var(--bg-secondary)",
              color: "var(--text-primary)",
              borderRadius: "6px",
              border: "0.5px solid var(--ds-border)",
            }}
          >
            <RotateCcw size={16} />
            Refazer
          </button>
          <button
            onClick={processReceipt}
            className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium text-white transition-colors"
            style={{ backgroundColor: "#3B82F6", borderRadius: "6px" }}
          >
            <Save size={16} />
            Processar
          </button>
        </div>
      </div>
    );
  }

  /* ─── PROCESSING STEP ─── */
  if (step === "processing") {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6" style={{ backgroundColor: "var(--bg-primary)" }}>
        <div className="flex flex-col items-center gap-5">
          <div className="relative">
            <div className="w-20 h-20 rounded-2xl flex items-center justify-center" style={{ backgroundColor: "var(--bg-secondary)" }}>
              <Loader2 size={36} className="animate-spin" style={{ color: "#3B82F6" }} />
            </div>
          </div>
          <div className="text-center">
            <h2 className="text-base font-medium mb-1.5" style={{ color: "var(--text-primary)" }}>Processando comprovante</h2>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
              Extraindo texto via OCR...
            </p>
          </div>
          {/* Progress hints */}
          <div className="flex flex-col gap-2 mt-2">
            {["Lendo documento via EasyOCR", "Identificando valores com RegEx", "Classificando categoria"].map((text, i) => (
              <div key={i} className="flex items-center gap-2" style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>
                <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: "#3B82F6", animationDelay: `${i * 0.3}s` }} />
                {text}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  /* ─── RESULT STEP ─── */
  if (step === "result" && editData) {
    const isInflow = editData.transaction_type === "Inflow";
    const amountColor = isInflow ? "#10B981" : "#EF4444";

    return (
      <div className="h-full flex flex-col" style={{ backgroundColor: "var(--bg-primary)" }}>
        {/* Header */}
        <div className="flex items-center justify-between p-4" style={{ borderBottom: "0.5px solid var(--ds-border)" }}>
          <div className="flex items-center gap-3">
            <Link href="/" className="p-1.5 rounded-md" style={{ color: "var(--text-secondary)" }}>
              <ChevronLeft size={20} />
            </Link>
            <h1 className="text-base font-medium" style={{ color: "var(--text-primary)" }}>Resultado</h1>
          </div>
          {!isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors"
              style={{
                backgroundColor: "var(--bg-secondary)",
                color: "var(--text-secondary)",
                borderRadius: "6px",
                border: "0.5px solid var(--ds-border)",
              }}
            >
              <Pencil size={13} />
              Editar
            </button>
          )}
        </div>

        <div className="flex-1 overflow-auto p-4">
          {/* Status badge */}
          {idempotent && (
            <div className="flex items-center gap-2 px-3 py-2 mb-4" style={{ backgroundColor: "rgba(245, 158, 11, 0.1)", borderRadius: "6px", fontSize: "12px", color: "#F59E0B" }}>
              <AlertTriangle size={14} />
              Este comprovante já foi registrado anteriormente.
            </div>
          )}

          {editData.needs_manual_review && !idempotent && (
            <div className="flex items-center gap-2 px-3 py-2 mb-4" style={{ backgroundColor: "rgba(245, 158, 11, 0.1)", borderRadius: "6px", fontSize: "12px", color: "#F59E0B" }}>
              <AlertTriangle size={14} />
              Revise os dados — o OCR não teve total confiança na extração.
            </div>
          )}

          {!idempotent && !editData.needs_manual_review && (
            <div className="flex items-center gap-2 px-3 py-2 mb-4" style={{ backgroundColor: "rgba(16, 185, 129, 0.1)", borderRadius: "6px", fontSize: "12px", color: "#10B981" }}>
              <CheckCircle2 size={14} />
              Dados extraídos e salvos com sucesso!
            </div>
          )}

          {/* Amount card */}
          <div className="mb-4 p-4 text-center" style={{ backgroundColor: "var(--bg-secondary)", borderRadius: "8px" }}>
            <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "4px" }}>
              {isInflow ? "Valor recebido" : "Valor pago"}
            </p>
            {isEditing ? (
              <input
                type="number"
                step="0.01"
                value={editData.total_amount}
                onChange={(e) => setEditData({ ...editData, total_amount: parseFloat(e.target.value) || 0 })}
                className="w-full text-center outline-none valor-financeiro"
                style={{
                  fontSize: "28px",
                  fontWeight: 500,
                  color: amountColor,
                  backgroundColor: "transparent",
                  border: "none",
                  borderBottom: "0.5px solid var(--ds-border)",
                  paddingBottom: "4px",
                }}
              />
            ) : (
              <p className="valor-financeiro" style={{ fontSize: "28px", fontWeight: 500, color: amountColor }}>
                {isInflow ? "" : "-"}{formatCurrency(editData.total_amount)}
              </p>
            )}
          </div>

          {/* Details */}
          <div className="flex flex-col gap-0" style={{ backgroundColor: "var(--bg-secondary)", borderRadius: "8px", overflow: "hidden" }}>
            {[
              { label: "Estabelecimento", key: "merchant_name" as const, value: editData.merchant_name },
              { label: "Categoria", key: "smart_category" as const, value: editData.smart_category },
              { label: "Data", key: "transaction_date" as const, value: editData.transaction_date, display: formatDate(editData.transaction_date) },
              { label: "Tipo", key: "transaction_type" as const, value: editData.transaction_type },
              { label: "Forma de pagamento", key: "payment_method" as const, value: editData.payment_method },
              ...(editData.destination_institution ? [{ label: "Instituição destino", key: "destination_institution" as const, value: editData.destination_institution }] : []),
              ...(editData.transaction_id ? [{ label: "ID da transação", key: "transaction_id" as const, value: editData.transaction_id }] : []),
              ...(editData.masked_cpf ? [{ label: "CPF", key: "masked_cpf" as const, value: editData.masked_cpf }] : []),
            ].map((field, i, arr) => (
              <div
                key={field.key}
                className="flex items-center justify-between px-4 py-3"
                style={i < arr.length - 1 ? { borderBottom: "0.5px solid var(--ds-border)" } : {}}
              >
                <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>{field.label}</span>
                {isEditing && field.key !== "transaction_id" && field.key !== "masked_cpf" ? (
                  field.key === "transaction_type" ? (
                    <select
                      value={editData.transaction_type}
                      onChange={(e) => setEditData({ ...editData, transaction_type: e.target.value as "Inflow" | "Outflow" })}
                      className="text-right outline-none"
                      style={{
                        fontSize: "14px",
                        fontWeight: 500,
                        color: "var(--text-primary)",
                        backgroundColor: "transparent",
                        border: "none",
                      }}
                    >
                      <option value="Outflow">Saída</option>
                      <option value="Inflow">Entrada</option>
                    </select>
                  ) : (
                    <input
                      type={field.key === "transaction_date" ? "datetime-local" : "text"}
                      value={
                        field.key === "transaction_date"
                          ? editData.transaction_date.slice(0, 16)
                          : (editData[field.key] || "")
                      }
                      onChange={(e) => setEditData({ ...editData, [field.key]: e.target.value })}
                      className="text-right outline-none max-w-[60%]"
                      style={{
                        fontSize: "14px",
                        fontWeight: 500,
                        color: "var(--text-primary)",
                        backgroundColor: "transparent",
                        border: "none",
                        borderBottom: "0.5px solid var(--ds-border)",
                      }}
                    />
                  )
                ) : (
                  <span style={{ fontSize: "14px", fontWeight: 500, color: "var(--text-primary)" }}>
                    {field.key === "transaction_type"
                      ? (field.value === "Inflow" ? "Entrada" : "Saída")
                      : (field.display || field.value)}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Note */}
          {note && (
            <div className="mt-4 px-4 py-3" style={{ backgroundColor: "var(--bg-secondary)", borderRadius: "8px" }}>
              <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "2px" }}>Observação</p>
              <p style={{ fontSize: "14px", color: "var(--text-primary)" }}>{note}</p>
            </div>
          )}
        </div>

        {/* Bottom actions */}
        <div className="p-4 flex gap-3" style={{ borderTop: "0.5px solid var(--ds-border)" }}>
          {isEditing ? (
            <>
              <button
                onClick={() => {
                  setEditData(extractedData ? { ...extractedData } : null);
                  setIsEditing(false);
                }}
                className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors"
                style={{
                  backgroundColor: "var(--bg-secondary)",
                  color: "var(--text-primary)",
                  borderRadius: "6px",
                  border: "0.5px solid var(--ds-border)",
                }}
              >
                Cancelar
              </button>
              <button
                onClick={() => setIsEditing(false)}
                className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium text-white transition-colors"
                style={{ backgroundColor: "#10B981", borderRadius: "6px" }}
              >
                <CheckCircle2 size={16} />
                Confirmar
              </button>
            </>
          ) : (
            <>
              <button
                onClick={resetAll}
                className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors"
                style={{
                  backgroundColor: "var(--bg-secondary)",
                  color: "var(--text-primary)",
                  borderRadius: "6px",
                  border: "0.5px solid var(--ds-border)",
                }}
              >
                <RotateCcw size={16} />
                Novo Scan
              </button>
              <Link
                href="/"
                className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium text-white transition-colors no-underline"
                style={{ backgroundColor: "#3B82F6", borderRadius: "6px" }}
              >
                <CheckCircle2 size={16} />
                Ir ao Painel
              </Link>
            </>
          )}
        </div>
      </div>
    );
  }

  /* ─── ERROR STEP ─── */
  if (step === "error") {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6" style={{ backgroundColor: "var(--bg-primary)" }}>
        <div className="flex flex-col items-center gap-5 max-w-sm text-center">
          <div className="w-20 h-20 rounded-2xl flex items-center justify-center" style={{ backgroundColor: "rgba(239, 68, 68, 0.1)" }}>
            <AlertTriangle size={36} style={{ color: "#EF4444" }} />
          </div>
          <div>
            <h2 className="text-base font-medium mb-2" style={{ color: "var(--text-primary)" }}>Erro no processamento</h2>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: "1.5" }}>
              {errorMsg}
            </p>
          </div>
          <div className="flex flex-col gap-3 w-full">
            <button
              onClick={() => {
                setStep("preview");
                setErrorMsg("");
              }}
              className="flex items-center justify-center gap-2 w-full py-3 text-sm font-medium text-white transition-colors"
              style={{ backgroundColor: "#3B82F6", borderRadius: "6px" }}
            >
              <RotateCcw size={16} />
              Tentar Novamente
            </button>
            <button
              onClick={resetAll}
              className="flex items-center justify-center gap-2 w-full py-3 text-sm font-medium transition-colors"
              style={{
                backgroundColor: "var(--bg-secondary)",
                color: "var(--text-primary)",
                borderRadius: "6px",
                border: "0.5px solid var(--ds-border)",
              }}
            >
              Escolher Outro Arquivo
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* fallback */
  return null;
}
