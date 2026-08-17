'use client';

import { useEffect, useRef, useState } from 'react';
import { useApp } from '@/lib/appState';
import { assistenteLocal } from '@/lib/assistenteLocal';

interface Msg {
  de: 'user' | 'ia';
  texto: string;
}

const CHIPS = [
  'Quais vagas tem amanhã de manhã?',
  'Marca a Maria amanhã às 7h30 no Centro',
  'Desmarca o João de hoje 18h30',
];

/* Web Speech API (ditado) — sem tipos oficiais no TS */
interface RecognitionLike {
  lang: string;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}

function criarReconhecimento(): RecognitionLike | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => RecognitionLike;
    webkitSpeechRecognition?: new () => RecognitionLike;
  };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.lang = 'pt-BR';
  rec.interimResults = false;
  return rec;
}

export default function AssistentePage() {
  const { repo, demo, unidade, unidades, toast, bump } = useApp();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [entrada, setEntrada] = useState('');
  const [pensando, setPensando] = useState(false);
  const [apiOk, setApiOk] = useState<boolean | null>(demo ? false : null);
  const [temVoz, setTemVoz] = useState(false);
  const [ouvindo, setOuvindo] = useState(false);
  const recRef = useRef<RecognitionLike | null>(null);
  const fimRef = useRef<HTMLDivElement>(null);

  // a chave só existe no servidor — perguntamos ao endpoint se está configurada
  useEffect(() => {
    if (demo) return;
    fetch('/api/assistente')
      .then((r) => r.json())
      .then((j) => setApiOk(!!j.configurado))
      .catch(() => setApiOk(false));
  }, [demo]);

  useEffect(() => {
    setTemVoz(!!criarReconhecimento());
  }, []);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs, pensando]);

  function ditado() {
    if (ouvindo) {
      recRef.current?.stop();
      setOuvindo(false);
      return;
    }
    const rec = criarReconhecimento();
    if (!rec) return;
    recRef.current = rec;
    rec.onresult = (e) => {
      const texto = Array.from({ length: e.results.length }, (_, i) => e.results[i][0].transcript).join(' ');
      setEntrada((atual) => (atual ? atual + ' ' : '') + texto);
    };
    rec.onend = () => setOuvindo(false);
    rec.onerror = () => setOuvindo(false);
    setOuvindo(true);
    rec.start();
  }

  async function enviar(textoBruto?: string) {
    const texto = (textoBruto ?? entrada).trim();
    if (!texto || pensando) return;
    setEntrada('');
    const novas: Msg[] = [...msgs, { de: 'user', texto }];
    setMsgs(novas);
    setPensando(true);
    try {
      if (apiOk) {
        const token = (await repo.accessToken?.()) ?? null;
        const r = await fetch('/api/assistente', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            unidadeId: unidade?.id,
            mensagens: novas.map((m) => ({
              role: m.de === 'user' ? 'user' : 'assistant',
              content: m.texto,
            })),
          }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.erro ?? `HTTP ${r.status}`);
        setMsgs((m) => [...m, { de: 'ia', texto: j.resposta }]);
        if (j.houveAcao) bump();
      } else {
        const r = await assistenteLocal(repo, unidades, unidade, texto);
        setMsgs((m) => [...m, { de: 'ia', texto: r.texto }]);
        if (r.acao) bump();
      }
    } catch (e) {
      const erro = (e as Error).message;
      setMsgs((m) => [...m, { de: 'ia', texto: '⚠️ ' + erro }]);
      toast('Erro no assistente: ' + erro);
    }
    setPensando(false);
  }

  return (
    <div className="chat-wrap">
      {apiOk === false && (
        <p className="chat-aviso">
          {demo
            ? '✦ Modo demonstração — assistente local simples (sem IA). A versão completa usa a Claude API.'
            : 'Configure ANTHROPIC_API_KEY no .env para ativar a IA. Por enquanto vale um assistente local simples.'}
        </p>
      )}

      <div className="chat-msgs">
        {msgs.length === 0 && (
          <div className="chat-vazio">
            ✨ Escreva ou dite um comando — eu marco, desmarco e consulto vagas para você.
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`bubble ${m.de === 'user' ? 'me' : 'ia'}`}>
            {m.texto}
          </div>
        ))}
        {pensando && (
          <div className="bubble ia pensando">
            pensando<span className="dots"><i>.</i><i>.</i><i>.</i></span>
          </div>
        )}
        <div ref={fimRef} />
      </div>

      <div className="chips-sugg">
        {CHIPS.map((c) => (
          <button key={c} className="f-chip" disabled={pensando} onClick={() => enviar(c)}>
            {c}
          </button>
        ))}
      </div>

      <div className="chat-input-row">
        {temVoz && (
          <button
            className={`mic-btn ${ouvindo ? 'on' : ''}`}
            onClick={ditado}
            aria-label={ouvindo ? 'Parar ditado' : 'Ditar comando'}
          >
            {ouvindo ? '⏺' : '🎤'}
          </button>
        )}
        <input
          className="field chat-field"
          placeholder={ouvindo ? 'Ouvindo…' : 'ex.: marca a Maria amanhã às 7h30'}
          value={entrada}
          onChange={(e) => setEntrada(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') enviar();
          }}
        />
        <button className="btn send-btn" disabled={!entrada.trim() || pensando} onClick={() => enviar()}>
          ➤
        </button>
      </div>
    </div>
  );
}
