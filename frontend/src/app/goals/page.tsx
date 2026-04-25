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
  Copy,
  Loader2,
  CheckCircle2
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useGoalStore, Goal } from "@/store/useGoalStore";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function GoalsPage() {
  const [mounted, setMounted] = useState(false);
  const { goals, isLoading, fetchGoals, addGoal, updateGoal, deleteGoal } = useGoalStore();
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  
  // Form state
  const [name, setName] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [deadline, setDeadline] = useState("");
  const [autoRoundUp, setAutoRoundUp] = useState(false);
  const [autoTransfer, setAutoTransfer] = useState(false);

  useEffect(() => {
    setMounted(true);
    fetchGoals();
  }, [fetchGoals]);

  useEffect(() => {
    if (selectedGoal) {
      setName(selectedGoal.name);
      setTargetAmount(selectedGoal.target_amount.toString());
      setDeadline(selectedGoal.deadline ? selectedGoal.deadline.split('T')[0] : "");
      setAutoRoundUp(selectedGoal.auto_round_up > 0);
      setAutoTransfer(selectedGoal.auto_transfer_amount > 0);
      setIsCreating(false);
    } else if (isCreating) {
      setName("");
      setTargetAmount("");
      setDeadline("");
      setAutoRoundUp(false);
      setAutoTransfer(false);
    }
  }, [selectedGoal, isCreating]);

  if (!mounted) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const goalData = {
      name,
      target_amount: parseFloat(targetAmount) || 0,
      current_amount: selectedGoal ? selectedGoal.current_amount : 0,
      deadline: deadline || null,
      category: "Geral",
      status: "active",
      auto_round_up: autoRoundUp ? 10 : 0,
      auto_transfer_amount: autoTransfer ? 500 : 0,
      auto_transfer_day: autoTransfer ? 5 : null,
    };

    if (selectedGoal) {
      await updateGoal(selectedGoal.id, goalData);
    } else {
      await addGoal(goalData);
      setIsCreating(false);
    }
  };

  const handleCreateNew = () => {
    setSelectedGoal(null);
    setIsCreating(true);
  };

  const handleDelete = async () => {
    if (selectedGoal && confirm("Tem certeza que deseja excluir esta meta?")) {
      await deleteGoal(selectedGoal.id);
      setSelectedGoal(null);
    }
  };

  const handleDuplicate = async () => {
    if (selectedGoal) {
      const { id, user_id, created_at, ...rest } = selectedGoal;
      await addGoal({ ...rest, name: `${rest.name} (Cópia)` });
    }
  };

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
          <AnimatePresence mode="popLayout">
            {isLoading && goals.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 text-ds-text-tertiary">
                <Loader2 className="animate-spin mb-2" size={24} />
                <span className="text-xs">Carregando metas...</span>
              </div>
            ) : goals.length === 0 ? (
              <div className="p-8 rounded-2xl bg-ds-bg-secondary border border-dashed border-ds-border text-center">
                <Target className="mx-auto mb-3 text-ds-text-tertiary" size={32} />
                <p className="text-sm text-ds-text-primary font-medium">Nenhuma meta criada</p>
                <p className="text-xs text-ds-text-tertiary mt-1">Comece criando seu primeiro objetivo financeiro!</p>
              </div>
            ) : (
              goals.map((goal) => {
                const progress = Math.min(100, Math.round((goal.current_amount / goal.target_amount) * 100)) || 0;
                const isSelected = selectedGoal?.id === goal.id;
                
                return (
                  <motion.div 
                    key={goal.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    onClick={() => setSelectedGoal(goal)}
                    className={`p-5 rounded-2xl bg-ds-bg-secondary border transition-all cursor-pointer hover:shadow-md ${
                      isSelected 
                        ? 'border-brand-purple shadow-lg shadow-purple-500/10' 
                        : 'border-ds-border opacity-80 hover:opacity-100'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-[14px] font-semibold text-ds-text-primary">{goal.name}</h3>
                      <span className="text-[11px] font-bold text-brand-purple tabular-nums">{progress}%</span>
                    </div>
                    <p className="text-[12px] text-ds-text-tertiary mb-4">
                      Meta: R$ {goal.target_amount.toLocaleString('pt-BR')}
                    </p>
                    <div className="w-full h-2.5 bg-ds-bg-primary rounded-full overflow-hidden mb-2">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        className="h-full bg-gradient-to-r from-brand-purple to-pink-500 rounded-full"
                      />
                    </div>
                    <div className="flex justify-between text-[11px] font-medium">
                      <span className="text-ds-text-primary tabular-nums">
                        R$ {goal.current_amount.toLocaleString('pt-BR')} guardados
                      </span>
                      <span className="text-ds-text-tertiary text-[10px]">
                        {goal.deadline ? format(new Date(goal.deadline), "MMM yyyy", { locale: ptBR }) : "Sem prazo"}
                      </span>
                    </div>
                  </motion.div>
                );
              })
            )}
          </AnimatePresence>

          <button 
            onClick={handleCreateNew}
            className={`w-full p-4 rounded-2xl border-2 border-dashed font-medium text-[13px] transition-all flex items-center justify-center gap-2 ${
              isCreating 
                ? 'border-brand-purple bg-brand-purple/5 text-brand-purple' 
                : 'border-ds-border text-ds-text-tertiary hover:text-ds-text-primary hover:border-ds-text-secondary hover:bg-ds-bg-secondary'
            }`}
          >
            <Plus size={16} /> Criar Nova Meta
          </button>
        </div>

        {/* Right Form */}
        <div className="lg:col-span-2">
          <AnimatePresence mode="wait">
            {(selectedGoal || isCreating) ? (
              <motion.div 
                key={selectedGoal ? `edit-${selectedGoal.id}` : 'create'}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="p-6 md:p-8 rounded-3xl bg-ds-bg-secondary border border-ds-border shadow-sm"
              >
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-[18px] font-bold text-ds-text-primary">
                    {selectedGoal ? 'Editar Meta' : 'Nova Meta'}
                  </h2>
                  {selectedGoal && selectedGoal.current_amount >= selectedGoal.target_amount && (
                    <span className="flex items-center gap-1.5 px-3 py-1 bg-green-500/10 text-green-500 text-[11px] font-bold rounded-full">
                      <CheckCircle2 size={12} /> META ALCANÇADA
                    </span>
                  )}
                </div>
                
                <form className="space-y-5" onSubmit={handleSave}>
                  <div className="space-y-2">
                    <label className="block text-[11px] font-black text-ds-text-tertiary uppercase tracking-widest">Nome da Meta</label>
                    <input 
                      type="text" 
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="Ex: MacBook Pro, Viagem, Reserva..."
                      required
                      className="w-full p-3 bg-ds-bg-primary border-thin border-ds-border rounded-xl text-ds-text-primary outline-none focus:border-brand-purple transition-all" 
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="block text-[11px] font-black text-ds-text-tertiary uppercase tracking-widest">Valor Alvo (R$)</label>
                      <input 
                        type="number" 
                        value={targetAmount}
                        onChange={e => setTargetAmount(e.target.value)}
                        placeholder="0.00"
                        required
                        step="0.01"
                        className="w-full p-3 bg-ds-bg-primary border-thin border-ds-border rounded-xl text-ds-text-primary outline-none focus:border-brand-purple transition-all" 
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-[11px] font-black text-ds-text-tertiary uppercase tracking-widest">Prazo</label>
                      <input 
                        type="date" 
                        value={deadline}
                        onChange={e => setDeadline(e.target.value)}
                        className="w-full p-3 bg-ds-bg-primary border-thin border-ds-border rounded-xl text-ds-text-primary outline-none focus:border-brand-purple transition-all [color-scheme:dark]" 
                      />
                    </div>
                  </div>
                  
                  <div className="pt-4 border-t border-ds-border mt-6">
                    <h3 className="text-[14px] font-semibold text-ds-text-primary mb-4">Regras de Economia (Simulação)</h3>
                    <div 
                      onClick={() => setAutoRoundUp(!autoRoundUp)}
                      className="flex items-center justify-between p-4 bg-ds-bg-primary rounded-xl mb-3 hover:bg-ds-bg-secondary transition-colors border border-transparent hover:border-ds-border cursor-pointer group"
                    >
                      <div>
                        <p className="text-[13px] font-medium text-ds-text-primary group-hover:text-brand-purple transition-colors">Arredondar Troco</p>
                        <p className="text-[11px] text-ds-text-tertiary mt-0.5">Guardar o troco arredondado para o próximo R$ 10 em cada gasto</p>
                      </div>
                      <div className={`w-10 h-6 rounded-full relative transition-colors ${autoRoundUp ? 'bg-brand-purple' : 'bg-ds-border'}`}>
                        <motion.div 
                          animate={{ x: autoRoundUp ? 18 : 2 }}
                          className="w-4 h-4 bg-white rounded-full absolute top-1 shadow-sm"
                        />
                      </div>
                    </div>
                    <div 
                      onClick={() => setAutoTransfer(!autoTransfer)}
                      className="flex items-center justify-between p-4 bg-ds-bg-primary rounded-xl hover:bg-ds-bg-secondary transition-colors border border-transparent hover:border-ds-border cursor-pointer group"
                    >
                      <div>
                        <p className="text-[13px] font-medium text-ds-text-primary group-hover:text-brand-purple transition-colors">Transferência Automática</p>
                        <p className="text-[11px] text-ds-text-tertiary mt-0.5">Transferir R$ 500 todo dia 05 para esta meta</p>
                      </div>
                      <div className={`w-10 h-6 rounded-full relative transition-colors ${autoTransfer ? 'bg-brand-purple' : 'bg-ds-border'}`}>
                        <motion.div 
                          animate={{ x: autoTransfer ? 18 : 2 }}
                          className="w-4 h-4 bg-white rounded-full absolute top-1 shadow-sm"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row justify-end gap-3 pt-6 mt-2">
                    {selectedGoal && (
                      <>
                        <button 
                          type="button"
                          onClick={handleDelete}
                          className="px-5 py-2.5 rounded-xl text-[13px] font-bold text-fn-expense border border-fn-expense/30 hover:bg-fn-expense/10 transition-colors"
                        >
                          Excluir Meta
                        </button>
                        <button 
                          type="button"
                          onClick={handleDuplicate}
                          className="px-5 py-2.5 rounded-xl text-[13px] font-bold text-ds-text-primary border border-ds-border hover:bg-ds-bg-primary transition-colors flex items-center justify-center gap-2"
                        >
                          <Copy size={14} /> Duplicar
                        </button>
                      </>
                    )}
                    <button 
                      type="submit"
                      disabled={isLoading}
                      className="px-8 py-2.5 rounded-xl text-[13px] font-bold text-white bg-brand-purple hover:bg-purple-700 shadow-lg shadow-purple-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {isLoading ? <Loader2 size={16} className="animate-spin" /> : null}
                      {selectedGoal ? 'Salvar Alterações' : 'Criar Meta'}
                    </button>
                  </div>
                </form>
              </motion.div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center p-12 text-center bg-ds-bg-secondary/30 border border-dashed border-ds-border rounded-3xl">
                <div className="w-16 h-16 bg-ds-bg-secondary rounded-full flex items-center justify-center mb-4 shadow-sm">
                  <Target className="text-ds-text-tertiary" size={32} />
                </div>
                <h3 className="text-lg font-semibold text-ds-text-primary">Selecione uma meta</h3>
                <p className="text-sm text-ds-text-tertiary max-w-xs mt-2">
                  Escolha uma meta na lista ao lado para editar ou clique em "Criar Nova Meta" para começar um novo objetivo.
                </p>
                <button 
                  onClick={handleCreateNew}
                  className="mt-6 px-6 py-2 bg-ds-bg-secondary border border-ds-border rounded-xl text-xs font-bold text-ds-text-primary hover:border-brand-purple transition-all"
                >
                  Começar Agora
                </button>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
