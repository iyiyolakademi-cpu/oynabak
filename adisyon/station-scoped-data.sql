-- Kitchen/bar operators receive only current tickets and products for their station.
-- Sales totals, other stations, past tickets and QR requests remain unavailable to them.
create or replace function public.ob_adisyon_list(p_venue_id text)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare ts jsonb; its jsonb; station_role text;
begin
 if not public.ob_adisyon_permission(p_venue_id,'read') then
  raise exception 'Yetkisiz islem';
 end if;
 if not exists(select 1 from public.ob_adisyon_settings where venue_id=p_venue_id and enabled)
 then raise exception 'Adisyon bu isletmede aktif degil'; end if;

 if not public.ob_adisyon_owner(p_venue_id) then
  select s.staff_role into station_role from public.ob_adisyon_staff s
  where s.venue_id=p_venue_id and s.user_id=auth.uid() and s.active;
 end if;
 if station_role in ('kitchen','bar') then
  select coalesce(jsonb_agg(to_jsonb(t) order by t.opened_at desc),'[]'::jsonb) into ts
  from (
   select t.id,t.venue_id,t.table_no,t.status,t.opened_at,t.closed_at
   from public.ob_adisyon_tickets t where t.venue_id=p_venue_id and t.status='open'
   and exists(select 1 from public.ob_adisyon_items i where i.ticket_id=t.id
     and i.station=station_role and i.status<>'void')
   order by t.opened_at desc limit 200
  ) t;
  select coalesce(jsonb_agg(to_jsonb(i) order by i.created_at),'[]'::jsonb) into its
  from (
   select i.id,i.ticket_id,i.venue_id,i.name,i.quantity,
    0::numeric AS unit_price, 0::numeric AS line_total, i.status,
    i.station,i.note,i.created_at,i.updated_at
   from public.ob_adisyon_items i
   join public.ob_adisyon_tickets t on t.id=i.ticket_id
   where i.venue_id=p_venue_id and i.station=station_role
    and t.status='open' and i.status<>'void'
   order by i.created_at limit 400
  ) i;
 else
  select coalesce(jsonb_agg(to_jsonb(t) order by t.opened_at desc),'[]'::jsonb) into ts
  from (select id,venue_id,table_no,status,opened_at,closed_at
        from public.ob_adisyon_tickets where venue_id=p_venue_id
        order by opened_at desc limit 200) t;
  select coalesce(jsonb_agg(to_jsonb(i) order by i.created_at),'[]'::jsonb) into its
  from (select id,ticket_id,venue_id,name,quantity,unit_price,line_total,status,
      station,note,menu_item_id,variant_id,created_at,updated_at
    from public.ob_adisyon_items where venue_id=p_venue_id
    and ticket_id in (select id from public.ob_adisyon_tickets
      where venue_id=p_venue_id order by opened_at desc limit 200)) i;
 end if;
 return jsonb_build_object('tickets',ts,'items',its);
end $$;
revoke all on function public.ob_adisyon_list(text) from public,anon,authenticated;
grant execute on function public.ob_adisyon_list(text) to authenticated;