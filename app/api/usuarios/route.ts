import { SupabaseClient, createClient } from '@supabase/supabase-js';

/* ============================================================
   POST /api/usuarios — gestão de equipe (só dono).

   Usa a SUPABASE_SERVICE_ROLE_KEY (server-only, NUNCA NEXT_PUBLIC)
   para criar usuários no auth e ajustar a tabela perfil. Antes de
   qualquer ação, o token do CHAMADOR é validado no servidor e o
   papel 'dono' é confirmado na tabela perfil — nunca se confia
   só no front.

   Ações (campo "acao" no corpo):
   - criar: { nome, email, senha, papel }
   - papel: { id, papel }            (trocar dono ↔ professora)
   - ativo: { id, ativo }            (desativar/reativar; aplica ban no auth)
   ============================================================ */

type Papel = 'dono' | 'professora';

interface Corpo {
  acao?: 'criar' | 'papel' | 'ativo';
  nome?: string;
  email?: string;
  senha?: string;
  papel?: Papel;
  id?: string;
  ativo?: boolean;
}

function erroJson(erro: string, status: number) {
  return Response.json({ erro }, { status });
}

/** valida o token e devolve o id do chamador se (e só se) for dono */
async function validaDono(
  supabaseUrl: string,
  anonKey: string,
  token: string
): Promise<string | null> {
  const sb: SupabaseClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) return null;
  const { data: perfil } = await sb
    .from('perfil')
    .select('papel')
    .eq('id', data.user.id)
    .single();
  return perfil?.papel === 'dono' ? data.user.id : null;
}

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey) return erroJson('sem_supabase', 503);

  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return erroJson('nao_autenticado', 401);
  const donoId = await validaDono(supabaseUrl, anonKey, token);
  if (!donoId) return erroJson('Apenas o dono pode gerenciar a equipe.', 403);

  if (!serviceKey) return erroJson('Configure SUPABASE_SERVICE_ROLE_KEY no servidor.', 503);

  let corpo: Corpo;
  try {
    corpo = await request.json();
  } catch {
    return erroJson('corpo_invalido', 400);
  }

  // client privilegiado (ignora RLS) — só usado DEPOIS da validação acima
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (corpo.acao === 'criar') {
    const nome = corpo.nome?.trim();
    const email = corpo.email?.trim().toLowerCase();
    const senha = corpo.senha ?? '';
    const papel: Papel = corpo.papel === 'dono' ? 'dono' : 'professora';
    if (!nome || !email || senha.length < 6) {
      return erroJson('Informe nome, e-mail e uma senha temporária com 6+ caracteres.', 400);
    }
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
      user_metadata: { nome },
    });
    if (error) {
      const msg = error.message.includes('already been registered')
        ? 'Já existe usuário com esse e-mail.'
        : error.message;
      return erroJson(msg, 400);
    }
    // o trigger handle_new_user cria o perfil como professora; ajusta nome/papel
    // e marca a troca de senha obrigatória no primeiro acesso
    const { error: e2 } = await admin
      .from('perfil')
      .upsert({ id: data.user.id, nome, papel, ativo: true, precisa_trocar_senha: true });
    if (e2) return erroJson('Usuário criado, mas falhou ao ajustar o perfil: ' + e2.message, 500);
    return Response.json({ ok: true, id: data.user.id });
  }

  if (corpo.acao === 'papel') {
    if (!corpo.id || (corpo.papel !== 'dono' && corpo.papel !== 'professora')) {
      return erroJson('parametros_invalidos', 400);
    }
    if (corpo.id === donoId && corpo.papel !== 'dono') {
      return erroJson('Você não pode remover o próprio papel de dono.', 400);
    }
    const { error } = await admin.from('perfil').update({ papel: corpo.papel }).eq('id', corpo.id);
    if (error) return erroJson(error.message, 500);
    return Response.json({ ok: true });
  }

  if (corpo.acao === 'ativo') {
    if (!corpo.id || typeof corpo.ativo !== 'boolean') return erroJson('parametros_invalidos', 400);
    if (corpo.id === donoId && !corpo.ativo) {
      return erroJson('Você não pode desativar a própria conta.', 400);
    }
    // ban no auth impede o login; perfil.ativo mostra o estado na lista
    const { error: e1 } = await admin.auth.admin.updateUserById(corpo.id, {
      ban_duration: corpo.ativo ? 'none' : '87600h', // ~10 anos
    });
    if (e1) return erroJson(e1.message, 500);
    const { error: e2 } = await admin.from('perfil').update({ ativo: corpo.ativo }).eq('id', corpo.id);
    if (e2) return erroJson(e2.message, 500);
    return Response.json({ ok: true });
  }

  return erroJson('acao_desconhecida', 400);
}
