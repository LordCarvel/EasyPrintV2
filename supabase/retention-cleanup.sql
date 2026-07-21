-- Mantem perfis e configuracoes, removendo dados operacionais com mais de 2 dias.
-- Execute este arquivo uma vez no SQL Editor do Supabase.

create extension if not exists pg_cron with schema pg_catalog;

create or replace function public.cleanup_easyprint_transient_data(
  retention_interval interval default interval '2 days'
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
  cutoff timestamptz := now() - retention_interval;
begin
  -- order_events e removido automaticamente pelo ON DELETE CASCADE de orders.
  delete from public.orders
  where created_at < cutoff;
  get diagnostics deleted_orders = row_count;

  -- Tokens antigos nao sao perfis; o usuario apenas precisara entrar novamente.
  delete from public.store_sessions
  where created_at < cutoff
     or (expires_at is not null and expires_at < now());
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

  return next;
end;
$$;

revoke all on function public.cleanup_easyprint_transient_data(interval) from public;
grant execute on function public.cleanup_easyprint_transient_data(interval) to service_role;

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

  -- Executa as 03:15 UTC nos dias impares do mes. O pg_cron do Supabase
  -- aceita cron tradicional, mas nao aceita intervalos como "48 hours".
  perform cron.schedule(
    'easyprint-retention-cleanup',
    '15 3 1-31/2 * *',
    $command$select public.cleanup_easyprint_transient_data(interval '2 days');$command$
  );
end;
$$;

-- Limpa imediatamente o que ja passou da retencao.
select * from public.cleanup_easyprint_transient_data(interval '2 days');
