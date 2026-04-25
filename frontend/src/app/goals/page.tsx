"use client";

import { useState, useEffect } from "react";
import { 
  Target, 
  Plus, 
  ChevronLeft, 
  Trophy, 
  Calendar, 
  Wallet,
  ArrowRight,
  Edit2,
  Trash2,
  Copy
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";

export default function GoalsPage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div className="p-4 md:p-5 pt-1 md:pt-2 space-y-5 font-sans" style={{ maxWidth: '100%' }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ds-text-primary">Metas Financeiras</h1>
          <p className="text-xs text-ds-text-tertiary mt-0.5">Acompanhe seus objetivos e economias</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Sidebar - Goal Cards */}
        <div className="lg:col-span-1 space-y-4">
          <div className="p-5 rounded-2xl bg-ds-bg-secondary border border-brand-purple/30 shadow-lg shadow-purple-500/5 cursor-pointer">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[14px] font-semibold text-ds-text-primary">MacBook Pro M3</h3>
              <span className="text-[11px] font-bold text-brand-purple tabular-nums">45%</span>
            </div>
            <p className="text-[12px] text-ds-text-tertiary mb-4">Meta: R$ 18.000</p>
            <div className="w-full h-2.5 bg-ds-bg-primary rounded-full overflow-hidden mb-2">
              <div className="h-full bg-gradient-to-r from-brand-purple to-pink-500 rounded-full" style={{ width: '45%' }}></div>
            </div>
            <div className="flex justify-between text-[11px] font-medium">
              <span className="text-ds-text-primary tabular-nums">R$ 8.100 guardados</span>
              <span className="text-ds-text-tertiary text-[10px]">Dez 2026</span>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-ds-bg-secondary border border-ds-border opacity-60 hover:opacity-100 transition-opacity cursor-pointer">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[14px] font-semibold text-ds-text-primary">Reserva de Emergência</h3>
              <span className="text-[11px] font-bold text-brand-purple tabular-nums">12%</span>
            </div>
            <p className="text-[12px] text-ds-text-tertiary mb-4">Meta: R$ 50.000</p>
            <div className="w-full h-2.5 bg-ds-bg-primary rounded-full overflow-hidden mb-2">
              <div className="h-full bg-gradient-to-r from-blue-500 to-brand-purple rounded-full" style={{ width: '12%' }}></div>
            </div>
            <div className="flex justify-between text-[11px] font-medium">
              <span className="text-ds-text-primary tabular-nums">R$ 6.000 guardados</span>
              <span className="text-ds-text-tertiary text-[10px]">Sem prazo</span>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-ds-bg-secondary border border-ds-border opacity-60 hover:opacity-100 transition-opacity cursor-pointer">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[14px] font-semibold text-ds-text-primary">Viagem de Férias</h3>
              <span className="text-[11px] font-bold text-brand-purple tabular-nums">68%</span>
            </div>
            <p className="text-[12px] text-ds-text-tertiary mb-4">Meta: R$ 8.000</p>
            <div className="w-full h-2.5 bg-ds-bg-primary rounded-full overflow-hidden mb-2">
              <div className="h-full bg-gradient-to-r from-brand-purple to-indigo-500 rounded-full" style={{ width: '68%' }}></div>
            </div>
            <div className="flex justify-between text-[11px] font-medium">
              <span className="text-ds-text-primary tabular-nums">R$ 5.440 guardados</span>
              <span className="text-ds-text-tertiary text-[10px]">Jul 2026</span>
            </div>
          </div>

          <button className="w-full p-4 rounded-2xl border-2 border-dashed border-ds-border text-ds-text-tertiary font-medium text-[13px] hover:text-ds-text-primary hover:border-ds-text-secondary hover:bg-ds-bg-secondary transition-all flex items-center justify-center gap-2">
            <Plus size={16} /> Criar Nova Meta
          </button>
        </div>

        {/* Right Form */}
        <div className="lg:col-span-2 p-6 md:p-8 rounded-3xl bg-ds-bg-secondary border border-ds-border">
          <h2 className="text-[18px] font-bold text-ds-text-primary mb-6">Editar Meta</h2>
          <form className="space-y-5" onSubmit={e => e.preventDefault()}>
            <div className="space-y-2">
              <label className="block text-[11px] font-black text-ds-text-tertiary uppercase tracking-widest">Nome da Meta</label>
              <input type="text" defaultValue="MacBook Pro M3" className="w-full p-3 bg-ds-bg-primary border-thin border-ds-border rounded-xl text-ds-text-primary outline-none focus:border-brand-purple transition-all" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-[11px] font-black text-ds-text-tertiary uppercase tracking-widest">Valor Alvo (R$)</label>
                <input type="text" defaultValue="18000" className="w-full p-3 bg-ds-bg-primary border-thin border-ds-border rounded-xl text-ds-text-primary outline-none focus:border-brand-purple transition-all" />
              </div>
              <div className="space-y-2">
                <label className="block text-[11px] font-black text-ds-text-tertiary uppercase tracking-widest">Prazo</label>
                <input type="date" defaultValue="2026-12-31" className="w-full p-3 bg-ds-bg-primary border-thin border-ds-border rounded-xl text-ds-text-primary outline-none focus:border-brand-purple transition-all" />
              </div>
            </div>
            
            <div className="pt-4 border-t border-ds-border mt-6">
              <h3 className="text-[14px] font-semibold text-ds-text-primary mb-4">Regras de Economia</h3>
              <div className="flex items-center justify-between p-4 bg-ds-bg-primary rounded-xl mb-3 hover:bg-ds-bg-secondary transition-colors border border-transparent hover:border-ds-border">
                <div>
                  <p className="text-[13px] font-medium text-ds-text-primary">Arredondar Troco</p>
                  <p className="text-[11px] text-ds-text-tertiary mt-0.5">Guardar o troco arredondado para o próximo R$ 10</p>
                </div>
                <div className="w-10 h-6 bg-brand-purple rounded-full relative cursor-pointer">
                  <div className="w-4 h-4 bg-white rounded-full absolute right-1 top-1 shadow-sm"></div>
                </div>
              </div>
              <div className="flex items-center justify-between p-4 bg-ds-bg-primary rounded-xl hover:bg-ds-bg-secondary transition-colors border border-transparent hover:border-ds-border">
                <div>
                  <p className="text-[13px] font-medium text-ds-text-primary">Transferência Automática</p>
                  <p className="text-[11px] text-ds-text-tertiary mt-0.5">Transferir R$ 500 todo dia 05</p>
                </div>
                <div className="w-10 h-6 bg-ds-border rounded-full relative cursor-pointer">
                  <div className="w-4 h-4 bg-ds-text-tertiary rounded-full absolute left-1 top-1"></div>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row justify-end gap-3 pt-6 mt-2">
              <button className="px-5 py-2.5 rounded-xl text-[13px] font-bold text-fn-expense border border-fn-expense/30 hover:bg-fn-expense/10 transition-colors">Excluir Meta</button>
              <button className="px-5 py-2.5 rounded-xl text-[13px] font-bold text-ds-text-primary border border-ds-border hover:bg-ds-bg-primary transition-colors flex items-center justify-center gap-2">
                <Copy size={14} /> Duplicar
              </button>
              <button className="px-8 py-2.5 rounded-xl text-[13px] font-bold text-white bg-brand-purple hover:bg-purple-700 shadow-lg shadow-purple-500/20 transition-all">Salvar Meta</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
