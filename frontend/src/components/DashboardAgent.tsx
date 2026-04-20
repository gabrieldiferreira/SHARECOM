"use client";

import React, { useMemo } from 'react';
import { TransactionEntity } from '@/lib/db';

/**
 * DASHBOARD DISTRIBUTION AGENT
 * 
 * Este "Agente" é responsável por monitorar o fluxo de dados (comprovantes)
 * e decidir em tempo real quais templates analíticos devem ser expostos ao usuário.
 * 
 * Regra de Ouro: Se não há dado para sustentar a visão, o template é suprimido.
 */

export interface DashboardTemplates {
  hasGrowth: boolean;
  hasCategories: boolean;
  hasCounterparties: boolean;
  hasBanks: boolean;
  hasRecent: boolean;
  hasPhysicalEntities: boolean;
  hasLegalEntities: boolean;
  hasInsights: boolean;
}

export function useDashboardAgent(transactions: TransactionEntity[]) {
  const activeTemplates: DashboardTemplates = useMemo(() => {
    // Modo de Varredura: O agente analisa todo o dataset sempre que um novo comprovante entra
    const hasData = transactions.length > 0;
    
    // Análise de Categorias de Saída
    const hasCategories = transactions.some(tx => tx.transaction_type === 'Outflow' && tx.total_amount > 0);
    
    // Análise de Evolução (Crescimento) - Requer pelo menos 1 ponto de dado válido
    const hasGrowth = transactions.some(tx => tx.transaction_date && !isNaN(new Date(tx.transaction_date).getTime()));
    
    // Análise de Relacionamentos (Counterparties)
    const hasCounterparties = transactions.some(tx => tx.merchant_name && tx.merchant_name !== 'Desconhecido');
    
    // Análise de Instituições (Bancos)
    const hasBanks = transactions.some(tx => tx.destination_institution || (tx.payment_method && tx.payment_method !== 'Dinheiro'));
    
    // Heurística de Natureza Jurídica (Monitorada pelo Agente)
    const legalKeywords = ['LTDA', 'S/A', 'S.A.', 'ME', 'EPP', 'EIRELI', 'BANCO', 'ITAU', 'BRADESCO', 'NUBANK', 'INTER', 'CAIXA', 'SANTANDER'];
    const hasPhysicalEntities = transactions.some(tx => {
      const name = tx.merchant_name?.toUpperCase() || '';
      return name && !legalKeywords.some(k => name.includes(k)) && (!tx.masked_cpf || tx.masked_cpf.length <= 14);
    });
    
    const hasLegalEntities = transactions.some(tx => {
      const name = tx.merchant_name?.toUpperCase() || '';
      return name && (legalKeywords.some(k => name.includes(k)) || (tx.masked_cpf && tx.masked_cpf.length > 14));
    });

    const hasRecent = hasData;
    const hasInsights = hasData;

    return {
      hasGrowth,
      hasCategories,
      hasCounterparties,
      hasBanks,
      hasRecent,
      hasPhysicalEntities,
      hasLegalEntities,
      hasInsights
    };
  }, [transactions]);

  return activeTemplates;
}

/**
 * COMPONENTE AGENTE (WRAPPER)
 * Envelopa seções do dashboard e as renderiza apenas se o Agente autorizar a exposição.
 */
interface TemplateSentinelProps {
  id: keyof DashboardTemplates;
  agent: DashboardTemplates;
  children: React.ReactNode;
}

export const TemplateSentinel: React.FC<TemplateSentinelProps> = ({ id, agent, children }) => {
  if (!agent[id]) return null;
  return <>{children}</>;
};
