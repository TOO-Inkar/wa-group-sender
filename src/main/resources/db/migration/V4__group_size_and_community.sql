-- Размер группы и признак сообщества: в сообщество писать нельзя (сервер отвечает 420),
-- а в слишком большие группы whatsmeow не может отправить (сервер отвечает 479).
alter table wa_group add column participants int;
alter table wa_group add column community boolean default false not null;
alter table wa_group add column too_large boolean default false not null;
