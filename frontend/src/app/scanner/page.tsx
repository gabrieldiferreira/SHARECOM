"use client";

import NextImage from "next/image";
import React, { useState, useRef, useCallback } from "react";
import { Camera, Upload, X, Loader2, CheckCircle2, AlertTriangle, RotateCcw, Save, ChevronLeft, FileText, Image as LucideImage, Pencil, Flashlight, PencilLine } from "lucide-react";
import { getApiUrl } from "../../lib/api";
import { authenticatedFetch } from "../../lib/auth";
import { useTransactionStore } from "../../store/useTransactionStore";
import { TransactionEntity } from "../../lib/db";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { db } from "../../lib/firebase";
import { doc, updateDoc, serverTimestamp, increment } from "firebase/firestore";
import { useToast } from "../../components/ui/Toast";

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

interface DuplicateWarning {
  message: string;
  receipt_hash: string;
  times_scanned?: number;
  can_continue?: boolean;
  existing: {
    total_amount?: number;
    amount?: number;
    merchant_name?: string;
    merchant?: string;
    transaction_date?: string;
    date?: string | null;
  };
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
  const [flashEnabled, setFlashEnabled] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<DuplicateWarning | null>(null);
  const [receiptHash, setReceiptHash] = useState<string | null>(null);
  const { showToast } = useToast();

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
    setDuplicateWarning(null);
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

  const processReceipt = async (force = false) => {
    if (!selectedFile) return;

    setStep("processing");
    setDuplicateWarning(null);
    const formData = new FormData();
    formData.append("received_file", selectedFile, selectedFile.name);
    if (force) {
      formData.append("force", "true");
    }
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
        if (data.status === "duplicate_warning") {
          setDuplicateWarning(data);
          setStep("preview");
          return;
        }

        const ai = data.ai_data || {};
        const rawAmount = typeof ai.total_amount === "string"
          ? parseFloat(ai.total_amount.replace(/[^\d.,]/g, "").replace(",", "."))
          : Number(ai.total_amount) || 0;
        const parsedAmount = Number.isFinite(rawAmount) ? rawAmount : 0;
        const merchantName = String(ai.merchant_name || "").trim();
        const ocrFailed = merchantName.includes("OCR Falhou") || merchantName.toLowerCase().startsWith("erro");
        if (parsedAmount <= 0 && ocrFailed) {
          setErrorMsg("Não foi possível ler o comprovante. Envie uma imagem mais nítida ou cadastre manualmente.");
          setStep("error");
          return;
        }

        const extracted: ExtractedData = {
          total_amount: parsedAmount,
          merchant_name: merchantName || "Desconhecido",
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
        setReceiptHash(data.receipt_hash || null);

        // Always ensure the transaction exists locally in IndexedDB.
        // For duplicates: the backend returns the existing record's ai_data + database_id.
        // addTransaction uses put() with the same id, so it safely upserts without duplicating.
        if (data.database_id) {
          const txToSave: TransactionEntity = {
            id: data.database_id,
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
            receipt_hash: data.receipt_hash || `db_${data.database_id}`,
            is_synced: true,
            note: data.note || undefined,
          };
          await addTransaction(txToSave);
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

  const handleForceSubmit = () => {
    void processReceipt(true);
  };

  const handleConfirmScan = async () => {
    setIsEditing(false);
    if (!receiptHash || !extractedData || !editData || !db) return;

    try {
      const hasCorrections = JSON.stringify(editData) !== JSON.stringify(extractedData);
      
      await updateDoc(doc(db, 'nejix_training_data', receiptHash), {
        userVerified: true, 
        verifiedAt: serverTimestamp(), 
        userCorrections: hasCorrections ? editData : {}, 
        geminiGroundTruth: editData
      });
      
      await updateDoc(doc(db, 'nejix_stats', 'current'), {
        verifiedSamples: increment(1), 
        trainingReady: increment(hasCorrections ? 0 : 1)
      });
      
      if (hasCorrections) {
        showToast('Correções salvas! Você ajudou a treinar o Nejix 🧠', 'success');
      } else {
        showToast('Dados confirmados! Você ajudou a treinar o Nejix 🧠', 'success');
      }
    } catch (e) {
      console.error("Failed to save Nejix feedback:", e);
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

  /* ─── CAPTURE STEP - Full-screen camera viewfinder ─── */
  if (step === "capture") {
    return (
      <div className="h-full flex flex-col relative overflow-hidden" style={{ backgroundColor: '#0D0D12' }}>
        {/* Full-screen gradient overlay */}
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(139,92,246,0.15)_0%,_transparent_70%)]" />
        </div>

        {/* Header with flash toggle */}
        <div className="flex items-center justify-between p-4 relative z-10">
          <Link href="/" className="p-2 rounded-full transition-colors" style={{ background: 'rgba(255,255,255,0.1)', color: 'white' }}>
            <ChevronLeft size={22} />
          </Link>
          <h1 className="text-base font-semibold text-white">Escanear Comprovante</h1>
          <button 
            onClick={() => setFlashEnabled(!flashEnabled)}
            className="p-2 rounded-full transition-all"
            style={{ 
              background: flashEnabled ? 'rgba(255, 193, 7, 0.3)' : 'rgba(255,255,255,0.1)',
              color: flashEnabled ? '#FFEB3B' : 'white',
            }}
          >
            <Flashlight size={22} />
          </button>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6 relative z-10">
          {/* Camera Viewfinder with rounded-corner detection box */}
          <div className="relative w-[85vw] max-w-sm h-[55vh] flex items-center justify-center">
            <div 
              className="absolute inset-0 rounded-[32px] border-2 border-white/20 flex items-center justify-center"
              style={{ 
                background: 'rgba(255, 255, 255, 0.02)',
                boxShadow: 'inset 0 0 0 9999px rgba(0,0,0,0.3)',
              }}
              role="img"
              aria-label="Camera viewfinder"
            >
              {/* Corner markers */}
              <div className="absolute top-4 left-4 w-8 h-8 border-l-2 border-t-2 border-purple-500/80 rounded-tl-lg" />
              <div className="absolute top-4 right-4 w-8 h-8 border-r-2 border-t-2 border-purple-500/80 rounded-tr-lg" />
              <div className="absolute bottom-4 left-4 w-8 h-8 border-l-2 border-b-2 border-purple-500/80 rounded-bl-lg" />
              <div className="absolute bottom-4 right-4 w-8 h-8 border-r-2 border-b-2 border-purple-500/80 rounded-br-lg" />
              
              {/* Center scan icon */}
              <Camera size={56} className="text-purple-400/60" />
            </div>
            
            {/* Hint text */}
            <p className="absolute -bottom-16 text-center text-sm text-white/50">
              Posicione o comprovante Pix
            </p>
          </div>

          {/* Large purple circle capture button */}
          <button
            onClick={() => cameraInputRef.current?.click()}
            className="absolute bottom-8 left-1/2 -translate-x-1/2 w-20 h-20 rounded-full flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-all"
            style={{
              background: 'linear-gradient(135deg, #8B5CF6, #EC4899)',
              boxShadow: '0 4px 30px rgba(139, 92, 246, 0.5)',
              border: '4px solid rgba(255,255,255,0.3)',
            }}
          >
            <Camera size={32} className="text-white" />
          </button>

          {/* Gallery button - bottom left */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="absolute bottom-10 left-8 p-3 rounded-full transition-all"
            style={{ 
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'white',
            }}
          >
            <LucideImage size={22} />
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
              <NextImage
                src={previewUrl}
                alt="Comprovante"
                width={500}
                height={500}
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
            onClick={() => processReceipt()}
            className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium text-white transition-colors"
            style={{ backgroundColor: "#3B82F6", borderRadius: "6px" }}
          >
            <Save size={16} />
            Processar
          </button>
        </div>

        {duplicateWarning && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
            <div className="bg-[#1C1C23] border border-white/10 rounded-2xl p-6 max-w-sm w-full space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                  <AlertTriangle className="text-amber-400" size={20} />
                </div>
                <div>
                  <h3 className="text-white font-semibold">Comprovante já escaneado</h3>
                  <p className="text-white/50 text-sm">Escaneado {duplicateWarning.times_scanned || 1}x anteriormente</p>
                </div>
              </div>
              <div className="bg-black/20 rounded-xl p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-white/50 text-sm">Valor</span>
                  <span className="text-[#10B981] font-medium">R$ {(duplicateWarning.existing.total_amount || duplicateWarning.existing.amount || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/50 text-sm">Estabelecimento</span>
                  <span className="text-white text-sm">{duplicateWarning.existing.merchant_name || duplicateWarning.existing.merchant || "Desconhecido"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/50 text-sm">Data</span>
                  <span className="text-white text-sm">
                    {new Date(duplicateWarning.existing.transaction_date || duplicateWarning.existing.date || Date.now()).toLocaleDateString('pt-BR')}
                  </span>
                </div>
              </div>
              <div className="bg-[#8B5CF6]/10 border border-[#8B5CF6]/20 rounded-xl p-3">
                <p className="text-[#8B5CF6] text-xs text-center">🧠 Dados salvos no Firebase e serão usados para treinar o Nejix</p>
              </div>
              <p className="text-white/60 text-sm text-center">Deseja adicionar este comprovante mesmo assim?</p>
              <div className="flex gap-3">
                <button 
                  onClick={() => { setDuplicateWarning(null); resetAll(); }} 
                  className="flex-1 py-3 rounded-xl border border-white/10 text-white hover:bg-white/5 transition-colors"
                >
                  Não, cancelar
                </button>
                <button 
                  onClick={handleForceSubmit} 
                  className="flex-1 py-3 rounded-xl bg-[#8B5CF6] text-white font-medium hover:bg-[#8B5CF6]/90 transition-colors"
                >
                  Sim, adicionar
                </button>
              </div>
            </div>
          </div>
        )}
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
            {["Lendo documento via Gemini Vision", "Fallback Tesseract se necessário", "Classificando categoria"].map((text, i) => (
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

  /* ─── RESULT STEP - Glassmorphic bottom sheet ─── */
  if (step === "result" && editData) {
    const isInflow = editData.transaction_type === "Inflow";
    const amountColor = isInflow ? "#10B981" : "#EF4444";

    return (
      <div className="h-full flex flex-col relative" style={{ backgroundColor: "#0D0D12" }}>
        {/* Darkened background overlay */}
        <div className="absolute inset-0 z-0" style={{ background: 'rgba(0,0,0,0.6)' }} />

        {/* Header */}
        <div className="flex items-center justify-between p-4 relative z-10" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="flex items-center gap-3">
            <Link href="/" className="p-2 rounded-full" style={{ background: 'rgba(255,255,255,0.1)', color: 'white' }}>
              <ChevronLeft size={20} />
            </Link>
            <h1 className="text-base font-semibold" style={{ color: 'white' }}>Resultado</h1>
          </div>
          {!isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl transition-colors"
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: 'rgba(255,255,255,0.7)',
              }}
            >
              <PencilLine size={14} />
              Editar
            </button>
          )}
        </div>

        <div className="flex-1 overflow-auto p-4 relative z-10">
          {/* Status badges */}
          <AnimatePresence>
            {idempotent && (
              <motion.div 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-2 px-4 py-3 mb-4 rounded-xl"
                style={{ background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.3)' }}
              >
                <AlertTriangle size={16} className="text-amber-500" />
                <span className="text-sm text-amber-400">Comprovante duplicado</span>
              </motion.div>
            )}

            {editData.needs_manual_review && !idempotent && (
              <motion.div 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-2 px-4 py-3 mb-4 rounded-xl"
                style={{ background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.3)' }}
              >
                <AlertTriangle size={16} className="text-amber-500" />
                <span className="text-sm text-amber-400">Revise os dados extraídos</span>
              </motion.div>
            )}

            {!idempotent && !editData.needs_manual_review && (
              <motion.div 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-2 px-4 py-3 mb-4 rounded-xl"
                style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)' }}
              >
                <CheckCircle2 size={16} className="text-emerald-500" />
                <span className="text-sm text-emerald-400">Salvo com sucesso!</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Glassmorphic Bottom Sheet */}
          <div 
            className="rounded-3xl overflow-hidden"
            style={{ 
              background: 'rgba(255, 255, 255, 0.03)',
              backdropFilter: 'blur(40px)',
              WebkitBackdropFilter: 'blur(40px)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            {/* Amount card */}
            <div className="p-6 text-center">
              <p className="text-xs text-white/50 mb-1">
                {isInflow ? 'Valor recebido' : 'Valor pago'}
              </p>
              {isEditing ? (
                <input
                  type="number"
                  step="0.01"
                  value={editData.total_amount}
                  onChange={(e) => setEditData({ ...editData, total_amount: parseFloat(e.target.value) || 0 })}
                  className="w-full text-center outline-none bg-transparent"
                  style={{
                    fontSize: "32px",
                    fontWeight: 700,
                    color: amountColor,
                    borderBottom: '1px solid rgba(255,255,255,0.1)',
                    paddingBottom: '8px',
                  }}
                />
              ) : (
                <p style={{ fontSize: "36px", fontWeight: 700, color: amountColor }}>
                  {isInflow ? '+' : '-'}R$ {editData.total_amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              )}
            </div>

            {/* Details - Editable fields */}
            <div className="divide-y" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              {[
                { label: "Estabelecimento", key: "merchant_name" as const, value: editData.merchant_name },
                { label: "Data", key: "transaction_date" as const, value: editData.transaction_date.slice(0, 16) },
                { label: "Tipo", key: "transaction_type" as const, value: editData.transaction_type },
                { label: "Forma", key: "payment_method" as const, value: editData.payment_method },
                { label: "Categoria", key: "smart_category" as const, value: editData.smart_category },
              ].map((field, i) => (
                <div
                  key={field.key}
                  className="flex items-center justify-between px-6 py-4"
                >
                  <span className="text-xs text-white/50">{field.label}</span>
                  {isEditing ? (
                    field.key === "transaction_type" ? (
                      <select
                        value={editData.transaction_type}
                        onChange={(e) => setEditData({ ...editData, transaction_type: e.target.value as "Inflow" | "Outflow" })}
                        className="text-right bg-transparent outline-none text-white font-medium"
                      >
                        <option value="Outflow" className="bg-[#0D0D12]">Saída</option>
                        <option value="Inflow" className="bg-[#0D0D12]">Entrada</option>
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={(editData as any)[field.key] || ""}
                        onChange={(e) => setEditData({ ...editData, [field.key]: e.target.value })}
                        className="text-right bg-transparent outline-none text-white font-medium"
                        style={{ borderBottom: '1px solid rgba(255,255,255,0.2)' }}
                      />
                    )
                  ) : (
                    <span className="text-sm font-medium text-white">
                      {field.key === "transaction_type"
                        ? (field.value === "Inflow" ? "Entrada" : "Saída")
                        : field.value}
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Note */}
            {note && (
              <div className="p-4" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                <p className="text-xs text-white/50 mb-1">Observação</p>
                <p className="text-sm text-white italic">&ldquo;{note}&rdquo;</p>
              </div>
            )}
          </div>
        </div>

        {/* Bottom CTA actions */}
        <div className="p-4 flex gap-3 relative z-10" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          {isEditing ? (
            <>
              <button
                onClick={() => {
                  setEditData(extractedData ? { ...extractedData } : null);
                  setIsEditing(false);
                }}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 text-sm font-semibold rounded-xl transition-colors"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'white',
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmScan}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 text-sm font-semibold text-white rounded-xl"
                style={{ background: 'linear-gradient(135deg, #8B5CF6, #EC4899)' }}
              >
                <CheckCircle2 size={16} />
                Confirmar
              </button>
            </>
          ) : (
            <>
              <button
                onClick={resetAll}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 text-sm font-semibold rounded-xl transition-colors"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'white',
                }}
              >
                <RotateCcw size={16} />
                Novo Scan
              </button>
              <Link
                href="/"
                className="flex-1 flex items-center justify-center gap-2 py-3.5 text-sm font-semibold text-white rounded-xl no-underline"
                style={{ 
                  background: 'linear-gradient(135deg, #8B5CF6, #EC4899)',
                  boxShadow: '0 4px 20px rgba(139, 92, 246, 0.3)',
                }}
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
