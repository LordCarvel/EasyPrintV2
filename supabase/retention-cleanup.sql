-- Mantem perfis e configuracoes e zera os dados operacionais a cada 2 dias.
-- Execute este arquivo uma vez no SQL Editor do Supabase e novamente sempre que
-- este arquivo mudar. Apenas salvar/implantar o repositorio nao altera o banco.

create extension if not exists pg_cron with schema pg_catalog;

create table if not exists public.easyprint_maintenance_state (
  job_name text primary key,
  last_run_at timestamptz not null
);

alter table public.easyprint_maintenance_state enable row level security;
revoke all on public.easyprint_maintenance_state from public, anon, authenticated;
grant all on public.easyprint_maintenance_state to service_role;

-- A versao anterior tinha apenas um argumento. O DROP evita deixar duas
-- sobrecargas da funcao quando este arquivo for reaplicado.
drop function if exists public.cleanup_easyprint_transient_data(interval);

create function public.cleanup_easyprint_transient_data(
  cleanup_interval interval default interval '2 days',
  force_cleanup boolean default false
)
returns table (
  deleted_orders bigint,
  deleted_sessions bigint,
  cleaned_store_settings bigint
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  previous_run_at timestamptz;
begin
  if cleanup_interval <= interval '0 seconds' then
    raise exception 'cleanup_interval precisa ser maior que zero';
  end if;

  -- Impede duas execucoes simultaneas (por exemplo, cron + execucao manual).
  perform pg_advisory_xact_lock(hashtext('easyprint-retention-cleanup'));

  select last_run_at
  into previous_run_at
  from public.easyprint_maintenance_state
  where job_name = 'easyprint-retention-cleanup';

  -- O cron verifica diariamente, mas a limpeza so acontece quando completou o
  -- intervalo. Isso mantem 48 horas reais inclusive na virada do mes.
  if not force_cleanup
     and previous_run_at is not null
     and previous_run_at > now() - cleanup_interval then
    deleted_orders := 0;
    deleted_sessions := 0;
    cleaned_store_settings := 0;
    return next;
    return;
  end if;

  -- Zera todos os pedidos operacionais. order_events e removido pelo CASCADE.
  delete from public.orders;
  get diagnostics deleted_orders = row_count;

  -- Preserva sessoes ativas para nao deslogar as lojas a cada dois dias.
  delete from public.store_sessions
  where expires_at is not null
    and expires_at < now();
  get diagnostics deleted_sessions = row_count;

  -- O job roda a cada dois dias e zera o operacional, preservando as chaves
  -- de configuracao e os perfis (inclusive motoboys e entregadores).
  update public.store_settings
  set
    cash_orders = '[]'::jsonb,
    cash_processed = '[]'::jsonb,
    sent_cash_cleared_at = null,
    delivery_board_state = (coalesce(delivery_board_state, '{}'::jsonb)
      - array['viagens', 'entregas'])
      || jsonb_build_object('viagens', '[]'::jsonb, 'entregas', '[]'::jsonb),
    finally_storage_state = (coalesce(finally_storage_state, '{}'::jsonb)
      - array['cash', 'incomingOrders', 'processedCommandIds', 'hubSync'])
      || jsonb_build_object(
        'cash', jsonb_build_object('dinheiro', '', 'cartao', '', 'online', ''),
        'incomingOrders', '[]'::jsonb,
        'processedCommandIds', '[]'::jsonb,
        'hubSync', jsonb_build_object('lastSyncAt', '', 'lastError', '', 'lastAppliedCommands', '[]'::jsonb)
      ),
    finally_storage_preview = '{}'::jsonb,
    updated_at = now()
  ;
  get diagnostics cleaned_store_settings = row_count;

  insert into public.easyprint_maintenance_state (job_name, last_run_at)
  values ('easyprint-retention-cleanup', now())
  on conflict (job_name) do update
  set last_run_at = excluded.last_run_at;

  return next;
end;
$$;

revoke all on function public.cleanup_easyprint_transient_data(interval, boolean) from public;
grant execute on function public.cleanup_easyprint_transient_data(interval, boolean) to service_role;

do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job
  where jobname = 'easyprint-retention-cleanup';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  -- Verifica diariamente as 03:15 UTC. A funcao executa a limpeza somente
  -- depois de 2 dias desde a ultima execucao bem-sucedida.
  perform cron.schedule(
    'easyprint-retention-cleanup',
    '15 3 * * *',
    $command$select public.cleanup_easyprint_transient_data(interval '2 days', false);$command$
  );
end;
$$;

-- Na instalacao/reaplicacao, zera imediatamente o operacional.
select * from public.cleanup_easyprint_transient_data(interval '2 days', true);

-- Confirma que o job ficou criado e ativo.
select jobid, jobname, schedule, command, active
from cron.job
where jobname = 'easyprint-retention-cleanup';
