-- Доставка ждёт, пока в группе кто-то ответит на наше прошлое сообщение; рассылка не висит из-за таких групп.
alter table delivery add column waiting_reply boolean default false not null;
create index idx_delivery_group_sent on delivery (group_jid, status, updated_at);
