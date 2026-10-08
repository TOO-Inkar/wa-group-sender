-- Группу исключаем по факту: WhatsApp отклонил отправку в неё с ошибкой 479 два раза подряд.
-- Порог по числу участников оказался неверным (отсекал половину рабочих групп) и по умолчанию выключен.
alter table wa_group add column rejected_count int default 0 not null;
alter table wa_group add column rejected boolean default false not null;

-- Счётчик сразу из истории, чтобы известные проблемные группы не ждали двух новых отказов.
update wa_group g set rejected_count = (
    select count(*) from delivery d where d.group_jid = g.jid and d.status = 'FAILED' and d.error like '%error 479%');
update wa_group set rejected = true where rejected_count >= 2;

-- Снять пометку «слишком большая», поставленную порогом 700, и вернуть такие группы в рассылку.
update wa_group set too_large = false;
update wa_group set active = (archived and coalesce(member, false) and coalesce(can_send, false) and not community and not rejected);
