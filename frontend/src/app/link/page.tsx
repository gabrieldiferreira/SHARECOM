"use client";

import { useState, useEffect } from "react";
import { Receipt, Coffee, ShoppingBag, Car, Home as HomeIcon, X, Plus, Search, ChevronLeft, Calendar, ArrowDownLeft, ArrowUpRight, Edit2, Trash2, Filter, Loader2, Link2, Copy, Share2, QrCode, CalendarOff, Clock, CheckCircle2, AlertCircle, ExternalLink } from "lucide-react";
import { useTransactionStore } from "../../store/useTransactionStore";
import { motion, AnimatePresence } from "framer-motion";

interface PaymentLink {
  id: string;
  amount: number;
  description: string;
  dueDate?: string;
  recipient?: string;
  expiresInDays: number;
  status: 'active' | 'paid' | 'expired';
  link: string;
  createdAt: string;
}

export default function LinkPage() {
  const { transactions, fetchTransactions } = useTransactionStore();
  
  const [mounted, setMounted] = useState(false);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [recipient, setRecipient] = useState("");
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [generatedLink, setGeneratedLink] = useState<PaymentLink | null>(null);
  const [copied, setCopied] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [links, setLinks] = useState<PaymentLink[]>([]);
  const [showForm, setShowForm] = useState(true);

  useEffect(() => {
    setMounted(true);
    import("../../lib/auth").then(({ getFirebaseAuthHeader }) => {
      getFirebaseAuthHeader({ requireUser: true })
        .then(() => {
          fetchTransactions();
        })
        .catch(() => {});
    });
  }, [fetchTransactions]);

  const handleCreateLink = async () => {
    if (!amount || parseFloat(amount) <= 0) return;
    setIsCreating(true);
    
    await new Promise(r => setTimeout(r, 1500));
    
    const newLink: PaymentLink = {
      id: Date.now().toString(),
      amount: parseFloat(amount),
      description: description || "Pagamento via PIX",
      dueDate: dueDate || undefined,
      recipient: recipient || undefined,
      expiresInDays,
      status: 'active',
      link: `https://sharecom.com/pay/${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    
    setLinks(prev => [newLink, ...prev]);
    setGeneratedLink(newLink);
    setIsCreating(false);
    setShowForm(false);
  };

  const handleCopyLink = () => {
    if (generatedLink) {
      navigator.clipboard.writeText(generatedLink.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleShareNative = async () => {
    if (generatedLink && navigator.share) {
      await navigator.share({
        title: generatedLink.description,
        text: `Pague R$ ${generatedLink.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} via PIX`,
        url: generatedLink.link,
      });
    }
  };

  const formatCurrency = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

  if (!mounted) {
    return (
      <div className="p-6 space-y-4">
        {[1,2,3].map(i => (
          <div key={i} className="h-24 rounded-2xl skeleton" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-4 md:p-5 space-y-5 font-sans" style={{ maxWidth: '100%' }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Link de Pagamento</h1>
          <p className="text-xs text-white/50 mt-0.5">Crie links para receber via PIX</p>
        </div>
      </div>

      {/* Fee info footer */}
      <div 
        className="p-3 rounded-xl flex items-center justify-between bg-ds-bg-secondary backdrop-blur-xl border border-ds-border"
      >
        <div className="flex items-center gap-2">
          <AlertCircle size={16} className="text-purple-400" />
          <span className="text-xs text-white/60">Taxa por transação:</span>
        </div>
        <span className="text-xs font-semibold text-purple-400">R$ 0,00 (Grátis)</span>
      </div>

      <AnimatePresence mode="wait">
        {showForm && !generatedLink ? (
          <motion.div
            key="form"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-4"
          >
            {/* Form Card - Centered */}
            <div 
              className="p-5 rounded-2xl bg-ds-bg-secondary backdrop-blur-xl border border-ds-border"
            >
              <h2 className="text-base font-semibold text-white mb-4">Novo Link de Pagamento</h2>

              {/* Amount - Large */}
              <div className="mb-4">
                <label className="text-xs text-white/50 mb-1.5 block">Valor</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl text-white/40">R$</span>
                  <input
                    type="number"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0,00"
                    className="w-full py-4 pl-12 pr-4 text-3xl font-bold bg-white/5 rounded-xl outline-none text-white placeholder-white/20 border border-ds-border"
                  />
                </div>
              </div>

              {/* Description */}
              <div className="mb-4">
                <label className="text-xs text-white/50 mb-1.5 block">Descrição</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ex: Almoco, Serviço..."
                  className="w-full py-3 px-4 text-sm bg-white/5 rounded-xl outline-none text-white placeholder-white/20 border border-ds-border"
                />
              </div>

              {/* Due Date Picker */}
              <div className="mb-4">
                <label className="text-xs text-white/50 mb-1.5 block">Data de vencimento (opcional)</label>
                <div className="relative">
                  <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full py-3 pl-10 pr-4 text-sm bg-white/5 rounded-xl outline-none text-white border border-ds-border"
                  />
                </div>
              </div>

              {/* Recipient - Optional */}
              <div className="mb-4">
                <label className="text-xs text-white/50 mb-1.5 block">Destinatário (opcional)</label>
                <input
                  type="text"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  placeholder="Nome ou CPF/CNPJ"
                  className="w-full py-3 px-4 text-sm bg-white/5 rounded-xl outline-none text-white placeholder-white/20 border border-ds-border"
                />
              </div>

              {/* Toggle - Link expira em X dias */}
              <div className="mb-5">
                <label className="text-xs text-white/50 mb-2 block">Expira em</label>
                <div className="flex gap-2">
                  {[1, 3, 7, 15, 30].map(days => (
                    <button
                      key={days}
                      onClick={() => setExpiresInDays(days)}
                      className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all ${expiresInDays === days ? 'text-white bg-gradient-to-r from-purple-600 to-pink-600' : 'text-white/50 border border-ds-border bg-white/5'}`}
                    >
                      {days}d
                    </button>
                  ))}
                </div>
              </div>

              {/* Create Button */}
              <button
                onClick={handleCreateLink}
                disabled={isCreating || !amount}
                className="w-full py-3.5 text-sm font-bold text-white rounded-xl transition-all disabled:opacity-50 bg-gradient-to-r from-purple-600 to-pink-600 shadow-lg"
              >
                {isCreating ? (
                  <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                ) : (
                  "CRIAR LINK"
                )}
              </button>
            </div>
          </motion.div>
        ) : generatedLink ? (
          <motion.div
            key="preview"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-4"
          >
            {/* Generated Link Preview - Glass Container */}
            <div 
              className="p-5 rounded-2xl bg-ds-bg-secondary backdrop-blur-xl border border-ds-border"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-white">Link gerado!</h2>
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-500/20">
                  <CheckCircle2 size={12} className="text-emerald-400" />
                  <span className="text-[10px] font-semibold text-emerald-400">ATIVO</span>
                </div>
              </div>

              {/* Amount Display */}
              <div className="text-center mb-5">
                <p className="text-xs text-white/50 mb-1">Valor a receber</p>
                <p className="text-3xl font-bold text-white">
                  {formatCurrency(generatedLink.amount)}
                </p>
                <p className="text-sm text-white/60 mt-1">{generatedLink.description}</p>
              </div>

              {/* Link Display with Copy */}
              <div 
                className="p-3 rounded-xl mb-4 flex items-center justify-between gap-2 bg-white/5 border border-ds-border"
              >
                <div className="flex items-center gap-2 overflow-hidden">
                  <Link2 size={16} className="text-purple-400 shrink-0" />
                  <span className="text-xs text-white/70 truncate font-mono">{generatedLink.link}</span>
                </div>
                <button
                  onClick={handleCopyLink}
                  className="p-2 rounded-lg shrink-0 transition-all bg-white/10"
                  style={{ background: copied ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255,255,255,0.1)' }}
                >
                  {copied ? (
                    <CheckCircle2 size={16} className="text-emerald-400" />
                  ) : (
                    <Copy size={16} className="text-white/70" />
                  )}
                </button>
              </div>

              {/* QR Code Display */}
              <div className="flex flex-col items-center mb-4">
                <div 
                  className="w-32 h-32 rounded-xl flex items-center justify-center mb-2"
                  style={{ background: 'white', padding: '12px' }}
                >
                  <QrCode size={96} className="text-black" />
                </div>
                <span className="text-xs text-white/50">Escaneie para pagar</span>
              </div>

              {/* Share Button - Opens native sheet */}
              <button
                onClick={handleShareNative}
                className="w-full py-3 flex items-center justify-center gap-2 rounded-xl font-medium text-sm transition-all bg-white/5 border border-ds-border text-white"
              >
                <Share2 size={16} />
                Compartilhar
              </button>

              {/* Create Another */}
              <button
                onClick={() => { setGeneratedLink(null); setShowForm(true); setAmount(""); setDescription(""); }}
                className="w-full py-2 text-xs text-white/50 hover:text-white transition-colors"
              >
                + Criar outro link
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* List of Created Links Below */}
      {links.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-white/70">Links criados</h3>
          {links.map(link => (
            <motion.div
              key={link.id}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              className="p-4 rounded-2xl flex items-center justify-between bg-ds-bg-secondary border border-ds-border"
            >
              <div className="flex items-center gap-3">
                <div 
                  className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(139, 92, 246, 0.15)' }}
                >
                  <QrCode size={20} className="text-purple-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">{formatCurrency(link.amount)}</p>
                  <p className="text-xs text-white/40 truncate max-w-[200px]">{link.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* Status Badge */}
                <span 
                  className="text-[10px] font-bold px-2 py-1 rounded-full"
                  style={link.status === 'active' 
                    ? { background: 'rgba(16, 185, 129, 0.15)', color: '#10B981' }
                    : link.status === 'expired'
                    ? { background: 'rgba(239, 68, 68, 0.15)', color: '#EF4444' }
                    : { background: 'rgba(139, 92, 246, 0.15)', color: '#8B5CF6' }
                  }
                >
                  {link.status === 'active' ? 'ATIVO' : link.status === 'expired' ? 'EXPIRADO' : 'PAGO'}
                </span>
                <button className="p-2 rounded-lg bg-white/5 border border-ds-border">
                  <ExternalLink size={14} className="text-white/50" />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}