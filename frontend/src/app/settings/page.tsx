"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import {
  Download,
  Upload,
  Settings as SettingsIcon,
  Pencil,
  X,
  Save,
  Globe,
  DollarSign,
  Calendar,
  Mail,
} from "lucide-react";
import { useToast } from "@/components/Toast";

interface UserData {
  name: string;
  email: string;
  photoURL: string;
  locale: string;
  currency: string;
  createdAt: string;
}

function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-ds-border ${className ?? ""}`}
    />
  );
}

function ProfileSkeleton() {
  return (
    <div className="p-4 rounded-xl bg-ds-bg-secondary border border-ds-border space-y-4">
      <div className="flex items-center gap-3">
        <Skeleton className="w-12 h-12 rounded-full flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-48" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 pt-2 border-t border-ds-border">
        <div className="space-y-1"><Skeleton className="h-3 w-12" /><Skeleton className="h-4 w-24" /></div>
        <div className="space-y-1"><Skeleton className="h-3 w-12" /><Skeleton className="h-4 w-16" /></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1"><Skeleton className="h-3 w-12" /><Skeleton className="h-4 w-20" /></div>
        <div className="space-y-1"><Skeleton className="h-3 w-16" /><Skeleton className="h-4 w-28" /></div>
      </div>
      <Skeleton className="h-9 w-32 rounded-lg" />
    </div>
  );
}

const LOCALE_OPTIONS = [
  { value: "pt-BR", label: "Português (BR)" },
  { value: "en",   label: "English" },
  { value: "es",   label: "Español" },
];

const CURRENCY_OPTIONS = [
  { value: "BRL", label: "Real (R$)" },
  { value: "USD", label: "Dólar ($)" },
  { value: "EUR", label: "Euro (€)" },
];

function localeLabel(loc?: string) {
  return LOCALE_OPTIONS.find((o) => o.value === loc)?.label ?? loc ?? "—";
}

function formatDate(iso?: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export default function SettingsPage() {
  const [mounted, setMounted]     = useState(false);
  const [user, setUser]           = useState<User | null>(null);
  const [userData, setUserData]   = useState<UserData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData]   = useState({ name: "", locale: "pt-BR", currency: "BRL" });
  const [isSaving, setIsSaving]   = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
    if (!auth) { setIsLoading(false); return; }

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);

      if (!currentUser) {
        setUserData(null);
        setIsLoading(false);
        return;
      }

      if (!db) { setIsLoading(false); return; }

      try {
        const snap = await getDoc(doc(db, "users", currentUser.uid));
        const data = snap.data() ?? {};

        const merged: UserData = {
          name:      data.name      || currentUser.displayName || "",
          email:     data.email     || currentUser.email       || "Não disponível",
          photoURL:  data.photoURL  || currentUser.photoURL   || "",
          locale:    data.locale    || "pt-BR",
          currency:  data.currency  || "BRL",
          createdAt: data.createdAt || "",
        };

        setUserData(merged);
        setFormData({ name: merged.name, locale: merged.locale, currency: merged.currency });

        // sync cookies for i18n middleware
        document.cookie = `NEXT_LOCALE=${merged.locale}; path=/; max-age=${60 * 60 * 24 * 365}`;
        document.cookie = `CURRENCY=${merged.currency}; path=/; max-age=${60 * 60 * 24 * 365}`;
      } catch (err) {
        console.error("Erro ao carregar dados do usuário:", err);
      } finally {
        setIsLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  /* ── Save ── */
  const handleSave = async () => {
    const currentUser = auth?.currentUser;
    if (!user || !db || !currentUser) {
      alert("Você precisa estar logado para salvar.");
      return;
    }

    setIsSaving(true);
    try {
      await updateDoc(doc(db, "users", currentUser.uid), {
        name:      formData.name,
        locale:    formData.locale,
        currency:  formData.currency,
        updatedAt: new Date().toISOString(),
      });

      document.cookie = `NEXT_LOCALE=${formData.locale}; path=/; max-age=${60 * 60 * 24 * 365}`;
      document.cookie = `CURRENCY=${formData.currency}; path=/; max-age=${60 * 60 * 24 * 365}`;
      localStorage.setItem("USER_CURRENCY", formData.currency);

      setUserData((prev) => prev ? { ...prev, ...formData } : prev);
      setIsEditing(false);
      alert("Dados atualizados com sucesso!");
    } catch (err) {
      console.error("Erro ao salvar:", err);
      alert("Erro ao salvar. Tente novamente.");
    } finally {
      setIsSaving(false);
    }
  };

  /* ── Export ── */
  const handleExport = async () => {
    if (!user) return showToast("error", "Você precisa estar logado para exportar.");
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/export", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Falha na exportação");
      const blob = await res.blob();
      const url  = window.URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = "transactions.json";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (e) {
      console.error(e);
      alert("Erro ao exportar dados.");
    }
  };

  /* ── Import ── */
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    try {
      const text  = await file.text();
      const data  = JSON.parse(text);
      const token = await user.getIdToken();
      const res   = await fetch("/api/import", {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify(data),
      });
      if (res.ok) { showToast("success", "Dados importados com sucesso!"); setTimeout(() => window.location.href = "/", 1000); }
      else          showToast("error", "Falha na importação dos dados.");
    } catch (err) {
      console.error(err);
      showToast("error", "Erro ao ler ou enviar arquivo.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  if (!mounted) return null;

  return (
    <div className="p-6 h-full flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-6">

      {/* Header icon */}
      <div className="w-14 h-14 rounded-lg flex items-center justify-center bg-ds-bg-secondary text-ds-text-secondary border border-ds-border">
        <SettingsIcon size={28} />
      </div>

      <h1 className="text-xl font-bold text-ds-text-primary">Configurações</h1>

      <div className="w-full space-y-4 text-left">

        {/* ── Profile card ── */}
        {isLoading ? (
          <ProfileSkeleton />
        ) : (
          <div className="p-4 rounded-xl bg-ds-bg-secondary border border-ds-border space-y-4">

            {/* Avatar + name + email */}
            <div className="flex items-center gap-3">
              {userData?.photoURL ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={userData.photoURL}
                  alt="Foto do perfil"
                  referrerPolicy="no-referrer"
                  className="w-14 h-14 rounded-full border-2 border-purple-500 object-cover flex-shrink-0"
                />
              ) : (
                <div className="w-14 h-14 rounded-full bg-purple-600 flex items-center justify-center text-white font-bold text-xl flex-shrink-0">
                  {userData?.name?.[0]?.toUpperCase() ?? "?"}
                </div>
              )}
              <div className="overflow-hidden">
                <p className="text-ds-text-primary font-semibold text-base truncate">
                  {userData?.name || "—"}
                </p>
                <p className="text-ds-text-secondary text-sm truncate flex items-center gap-1">
                  <Mail size={12} className="flex-shrink-0" />
                  {userData?.email || "—"}
                </p>
              </div>
            </div>

            {/* View-mode info grid */}
            {!isEditing && (
              <>
                <div className="grid grid-cols-2 gap-3 pt-3 border-t border-ds-border">
                  {/* Idioma */}
                  <div className="flex flex-col gap-0.5">
                    <span className="text-ds-text-secondary text-xs uppercase tracking-wide flex items-center gap-1">
                      <Globe size={11} /> Idioma
                    </span>
                    <p className="text-ds-text-primary text-sm font-medium">
                      {localeLabel(userData?.locale)}
                    </p>
                  </div>

                  {/* Moeda */}
                  <div className="flex flex-col gap-0.5">
                    <span className="text-ds-text-secondary text-xs uppercase tracking-wide flex items-center gap-1">
                      <DollarSign size={11} /> Moeda
                    </span>
                    <p className="text-ds-text-primary text-sm font-medium">
                      {userData?.currency ?? "—"}
                    </p>
                  </div>
                </div>

                {/* Membro desde */}
                {userData?.createdAt && (
                  <div className="flex flex-col gap-0.5 pt-1">
                    <span className="text-ds-text-secondary text-xs uppercase tracking-wide flex items-center gap-1">
                      <Calendar size={11} /> Membro desde
                    </span>
                    <p className="text-ds-text-primary text-sm font-medium">
                      {formatDate(userData.createdAt)}
                    </p>
                  </div>
                )}
              </>
            )}

            {/* Edit toggle button */}
            <button
              onClick={() => {
                if (isEditing) {
                  // cancel — restore original values
                  setFormData({
                    name:     userData?.name     ?? "",
                    locale:   userData?.locale   ?? "pt-BR",
                    currency: userData?.currency ?? "BRL",
                  });
                }
                setIsEditing(!isEditing);
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 active:scale-95 transition-all"
            >
              {isEditing ? <><X size={14} /> Cancelar</> : <><Pencil size={14} /> Editar Perfil</>}
            </button>

            {/* Edit form */}
            {isEditing && (
              <div className="space-y-3 pt-1 border-t border-ds-border">

                {/* Nome */}
                <div>
                  <label className="text-ds-text-secondary text-xs uppercase tracking-wide mb-1 block">
                    Nome
                  </label>
                  <input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Seu nome"
                    className="w-full p-3 bg-ds-bg-primary border border-ds-border rounded-lg text-ds-text-primary outline-none focus:border-purple-500 transition-colors"
                  />
                </div>

                {/* Idioma */}
                <div>
                  <label className="text-ds-text-secondary text-xs uppercase tracking-wide mb-1 block">
                    Idioma
                  </label>
                  <select
                    value={formData.locale}
                    onChange={(e) => setFormData({ ...formData, locale: e.target.value })}
                    className="w-full p-3 bg-ds-bg-primary border border-ds-border rounded-lg text-ds-text-primary outline-none focus:border-purple-500 transition-colors"
                  >
                    {LOCALE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>

                {/* Moeda */}
                <div>
                  <label className="text-ds-text-secondary text-xs uppercase tracking-wide mb-1 block">
                    Moeda
                  </label>
                  <select
                    value={formData.currency}
                    onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                    className="w-full p-3 bg-ds-bg-primary border border-ds-border rounded-lg text-ds-text-primary outline-none focus:border-purple-500 transition-colors"
                  >
                    {CURRENCY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>

                {/* Save */}
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-purple-600 text-white font-semibold hover:bg-purple-700 disabled:opacity-60 disabled:cursor-not-allowed active:scale-95 transition-all"
                >
                  <Save size={16} />
                  {isSaving ? "Salvando..." : "Salvar Alterações"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Data Management ── */}
        <div className="p-4 rounded-xl bg-ds-bg-secondary border border-ds-border space-y-3">
          <div className="mb-1">
            <span className="text-sm font-medium text-ds-text-secondary block">Gestão de Dados</span>
            <p className="text-xs text-ds-text-tertiary mt-1">
              Exporte seus dados para backup ou importe de outro dispositivo
            </p>
          </div>

          <button
            onClick={handleExport}
            className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-ds-bg-primary border border-ds-border rounded-lg text-ds-text-primary hover:bg-ds-border transition-colors"
          >
            <Download size={16} /> Exportar Dados
          </button>

          <input
            type="file"
            accept=".json"
            ref={fileInputRef}
            onChange={handleImport}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-ds-bg-primary border border-ds-border rounded-lg text-ds-text-primary hover:bg-ds-border transition-colors"
          >
            <Upload size={16} /> Importar Dados
          </button>
        </div>
      </div>

      <Link
        href="/"
        className="w-full py-3 mt-4 text-sm font-bold text-white transition-all bg-blue-600 hover:bg-blue-700 rounded-xl shadow-lg flex items-center justify-center"
      >
        Voltar ao Painel
      </Link>
    </div>
  );
}
