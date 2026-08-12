'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import type { AgendaRepo } from './repo';
import { isDemoMode } from './repo';
import { getRepo } from './getRepo';
import { Sessao, Unidade } from './types';

interface ToastState {
  msg: string;
  acao?: { label: string; fn: () => void };
}

interface AppCtx {
  repo: AgendaRepo;
  demo: boolean;
  sessao: Sessao | null;
  unidades: Unidade[];
  unidade: Unidade | null;
  setUnidadeId: (id: string) => void;
  off: number;
  setOff: (off: number) => void;
  pronto: boolean;
  refreshKey: number;
  bump: () => void;
  toast: (msg: string, acao?: ToastState['acao']) => void;
  recarregarUnidades: () => Promise<void>;
}

const Ctx = createContext<AppCtx | null>(null);

export function useApp(): AppCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp fora do AppProvider');
  return v;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const repo = useMemo(() => getRepo(), []);
  const demo = isDemoMode();

  const [sessao, setSessao] = useState<Sessao | null>(null);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [unidadeId, setUnidadeIdState] = useState<string>('');
  const [off, setOff] = useState(0);
  const [pronto, setPronto] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [toastState, setToastState] = useState<ToastState | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const bump = useCallback(() => setRefreshKey((k) => k + 1), []);

  const toast = useCallback((msg: string, acao?: ToastState['acao']) => {
    setToastState({ msg, acao });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastState(null), 3800);
  }, []);

  const recarregarUnidades = useCallback(async () => {
    const us = await repo.listUnidades();
    setUnidades(us);
  }, [repo]);

  // sessão + dados iniciais
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const s = await repo.sessionInfo();
        if (!vivo) return;
        if (!s) {
          router.replace('/login');
          return;
        }
        setSessao(s);
        const us = await repo.listUnidades();
        if (!vivo) return;
        setUnidades(us);
        const salvo =
          typeof window !== 'undefined' ? window.localStorage.getItem('unidade') : null;
        const inicial = us.find((u) => u.id === salvo) ?? us[0];
        if (inicial) setUnidadeIdState(inicial.id);
        setPronto(true);
      } catch {
        if (vivo) router.replace('/login');
      }
    })();
    return () => {
      vivo = false;
    };
  }, [repo, router]);

  // tempo real: qualquer mudança em reservas atualiza a tela
  useEffect(() => {
    if (!pronto) return;
    const unsub = repo.onReservasChange(() => bump());
    return unsub;
  }, [repo, pronto, bump]);

  // unidade selecionada foi excluída → cai na primeira disponível
  useEffect(() => {
    if (!pronto || !unidades.length) return;
    if (!unidades.some((u) => u.id === unidadeId)) {
      setUnidadeIdState(unidades[0].id);
    }
  }, [pronto, unidades, unidadeId]);

  const setUnidadeId = useCallback((id: string) => {
    setUnidadeIdState(id);
    try {
      window.localStorage.setItem('unidade', id);
    } catch {
      /* ok */
    }
  }, []);

  const unidade = unidades.find((u) => u.id === unidadeId) ?? null;

  const value: AppCtx = {
    repo,
    demo,
    sessao,
    unidades,
    unidade,
    setUnidadeId,
    off,
    setOff,
    pronto,
    refreshKey,
    bump,
    toast,
    recarregarUnidades,
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className={`toast ${toastState ? 'show' : ''}`}>
        {toastState?.msg}
        {toastState?.acao && (
          <button
            className="toast-act"
            onClick={() => {
              toastState.acao?.fn();
              setToastState(null);
            }}
          >
            {toastState.acao.label}
          </button>
        )}
      </div>
    </Ctx.Provider>
  );
}
