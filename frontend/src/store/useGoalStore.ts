import { create } from 'zustand';
import { getApiUrl } from '@/lib/api';
import { authenticatedFetch } from '@/lib/auth';

export interface Goal {
  id: number;
  user_id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  deadline: string | null;
  category: string;
  status: string;
  auto_round_up: number;
  auto_transfer_amount: number;
  auto_transfer_day: number | null;
  created_at: string;
}

interface GoalState {
  goals: Goal[];
  isLoading: boolean;
  error: string | null;
  fetchGoals: () => Promise<void>;
  addGoal: (goal: Omit<Goal, 'id' | 'user_id' | 'created_at'>) => Promise<void>;
  updateGoal: (id: number, updates: Partial<Goal>) => Promise<void>;
  deleteGoal: (id: number) => Promise<void>;
}

export const useGoalStore = create<GoalState>((set, get) => ({
  goals: [],
  isLoading: false,
  error: null,

  fetchGoals: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await authenticatedFetch(getApiUrl('/goals'));
      if (res.ok) {
        const data = await res.json();
        set({ goals: data, isLoading: false });
      } else {
        set({ error: 'Falha ao buscar metas', isLoading: false });
      }
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  addGoal: async (goalData) => {
    try {
      const res = await authenticatedFetch(getApiUrl('/goals'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(goalData),
      });
      if (res.ok) {
        const newGoal = await res.json();
        set({ goals: [newGoal, ...get().goals] });
      }
    } catch (err) {
      console.error('Error adding goal:', err);
    }
  },

  updateGoal: async (id, updates) => {
    try {
      const res = await authenticatedFetch(getApiUrl(`/goals/${id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const updated = await res.json();
        set({
          goals: get().goals.map((g) => (g.id === id ? updated : g)),
        });
      }
    } catch (err) {
      console.error('Error updating goal:', err);
    }
  },

  deleteGoal: async (id) => {
    try {
      const res = await authenticatedFetch(getApiUrl(`/goals/${id}`), {
        method: 'DELETE',
      });
      if (res.ok) {
        set({
          goals: get().goals.filter((g) => g.id !== id),
        });
      }
    } catch (err) {
      console.error('Error deleting goal:', err);
    }
  },
}));
