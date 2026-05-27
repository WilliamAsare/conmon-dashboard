-- Migration: SLA engine
-- Postgres function that recomputes days_to_sla for all open POA&Ms
-- and creates notifications for items entering or past the warning window.
-- Called nightly by the scheduled Edge Function.

-- ============================================================
-- Add computed SLA columns to poam_items
-- ============================================================

alter table poam_items
  add column days_to_sla   integer,
  add column sla_status    text not null default 'ok'
    check (sla_status in ('ok', 'warning', 'overdue', 'not_applicable'));

-- ============================================================
-- SLA recalculation function
-- ============================================================

create or replace function recalculate_sla()
returns void
language plpgsql
security definer
as $$
declare
  v_rec record;
  v_days_to_sla   integer;
  v_new_status    text;
  v_old_status    text;
  v_sla_days      integer;
  v_deadline      date;
begin
  for v_rec in
    select
      p.id,
      p.system_id,
      p.severity,
      p.identified_date,
      p.scheduled_completion,
      p.sla_status as current_status,
      s.organization_id
    from poam_items p
    join systems s on s.id = p.system_id
    where p.status in ('open', 'ongoing')
  loop

    -- Determine SLA window.
    v_sla_days := case v_rec.severity
      when 'high'          then 30
      when 'moderate'      then 90
      when 'low'           then 180
      else null
    end;

    if v_sla_days is null then
      v_new_status  := 'not_applicable';
      v_days_to_sla := null;
    else
      v_deadline    := v_rec.identified_date + v_sla_days;
      v_days_to_sla := v_deadline - current_date;

      v_new_status := case
        when v_days_to_sla < 0  then 'overdue'
        when v_days_to_sla <= 7 then 'warning'
        else 'ok'
      end;
    end if;

    -- Update the POA&M.
    update poam_items
    set
      days_to_sla = v_days_to_sla,
      sla_status  = v_new_status
    where id = v_rec.id;

    v_old_status := v_rec.current_status;

    -- Notify users in the org when a POA&M transitions into warning or overdue.
    -- Only notify on the transition (old status differs from new), not on every run.
    if v_new_status != v_old_status and v_new_status in ('warning', 'overdue') then
      insert into notifications (
        organization_id,
        user_id,
        type,
        title,
        body,
        entity_type,
        entity_id
      )
      select
        v_rec.organization_id,
        u.id,
        case v_new_status
          when 'warning' then 'sla_warning'::notification_type
          else                'sla_overdue'::notification_type
        end,
        case v_new_status
          when 'warning' then 'POA&M SLA Warning'
          else                'POA&M SLA Overdue'
        end,
        case v_new_status
          when 'warning' then
            format(
              'POA&M %s has %s days remaining before its SLA deadline.',
              (select poam_number from poam_items where id = v_rec.id),
              v_days_to_sla
            )
          else
            format(
              'POA&M %s is %s days past its SLA deadline.',
              (select poam_number from poam_items where id = v_rec.id),
              abs(v_days_to_sla)
            )
        end,
        'poam_items',
        v_rec.id
      from public.users u
      where
        u.organization_id = v_rec.organization_id
        and u.role in ('admin', 'issm', 'isso');
    end if;

  end loop;
end;
$$;

-- ============================================================
-- Indexes on new columns
-- ============================================================

create index on poam_items (sla_status) where status in ('open', 'ongoing');
create index on poam_items (days_to_sla) where status in ('open', 'ongoing');
