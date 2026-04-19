import Link from 'next/link';

export default function SettingsPage() {
  return (
    <div className="p-6 h-full flex flex-col items-center justify-center text-center">
      <div className="w-14 h-14 rounded-lg flex items-center justify-center mb-4" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
      </div>
      <h1 className="text-xl font-medium mb-2" style={{ color: 'var(--text-primary)' }}>Ajustes</h1>
      <p className="text-label max-w-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
        Configurações do sistema, exportação de dados e preferências chegarão na próxima atualização.
      </p>
      <Link href="/" className="px-5 py-2.5 text-sm font-medium text-white transition-colors" style={{ backgroundColor: '#3B82F6', borderRadius: '6px' }}>Voltar ao Painel</Link>
    </div>
  );
}
