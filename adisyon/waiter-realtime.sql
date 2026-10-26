-- Same OynaBak email-auth staff panel receives waiter-call changes immediately.
-- Other businesses' packages remain untouched.
drop trigger if exists ob_waiter_operations_signal on public.waiter_calls;
create trigger ob_waiter_operations_signal
after insert or update of status on public.waiter_calls
for each row execute function public.ob_adisyon_emit_signal();
