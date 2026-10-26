-- Integrate scoped staff access with existing adisyon APIs.
create or replace function public.ob_adisyon_has_access(p_venue_id text,p_admin_only boolean default false)
returns boolean language plpgsql stable security definer set search_path=''
as $$
begin
 if p_admin_only then return public.ob_adisyon_owner(p_venue_id); end if;
 return public.ob_adisyon_permission(p_venue_id,'read');
end $$;
-- API operation guards added ahead of existing RPC implementations.
