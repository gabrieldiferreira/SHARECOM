'use client'; // Error components must be Client Components

import { useEffect } from 'react';
import { AlertCircle, RefreshCw, Home } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    // Log the error to an error reporting service
    console.error('App Global Error:', error);
  }, [error]);

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-bg-primary text-text-primary p-6 font-sans">
      <div className="max-w-md w-full bg-bg-secondary border border-border rounded-2xl p-8 flex flex-col items-center text-center shadow-xl">
        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-6">
          <AlertCircle className="w-8 h-8 text-red-500" />
        </div>
        
        <h2 className="text-xl font-bold mb-3">Algo deu errado</h2>
        <p className="text-text-secondary text-sm mb-8 leading-relaxed">
          Ocorreu um erro inesperado na aplicação. Nossa equipe foi notificada (se o monitoramento estiver ativo). Você pode tentar carregar a página novamente.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 w-full">
          <button
            onClick={() => reset()}
            className="flex-1 bg-brand-cyan hover:bg-brand-cyan/90 text-white font-semibold py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2 active:scale-[0.98]"
          >
            <RefreshCw className="w-4 h-4" />
            Tentar novamente
          </button>
          <button
            onClick={() => router.push('/')}
            className="flex-1 bg-bg-tertiary hover:bg-bg-tertiary/80 text-text-primary font-medium py-3 px-4 rounded-xl transition-colors border border-border flex items-center justify-center gap-2 active:scale-[0.98]"
          >
            <Home className="w-4 h-4" />
            Início
          </button>
        </div>
        
        {process.env.NODE_ENV === 'development' && (
          <div className="mt-8 w-full text-left bg-black/50 p-4 rounded-xl border border-white/5 overflow-x-auto">
             <p className="text-red-400 font-mono text-xs mb-2 font-bold">Detalhes do erro (apenas Dev):</p>
             <pre className="text-white/70 font-mono text-[10px] break-all whitespace-pre-wrap">
               {error.message}
             </pre>
          </div>
        )}
      </div>
    </div>
  );
}
