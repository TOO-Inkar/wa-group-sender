-- Заявка, которую создаёт менеджер в админке, — campaign. Каждая её отправка (разовая или по расписанию)
-- — отдельная рассылка в request со своим планом доставок. Так повтор не ломает правило
-- «в одну группу одна доставка на рассылку», а отчёты и восстановление после рестарта работают как раньше.
create table campaign (
    id varchar(64) primary key,
    title varchar(200) not null,
    -- поля формы в JSON, чтобы заявку можно было открыть и поправить; пусто — правится готовый текст
    draft clob,
    message clob not null,
    targeted boolean not null,
    -- как показать адресатов: название списка групп или названия выбранных групп
    target_label varchar(500),
    -- ONCE — один раз; DAILY — каждый день в start_time; INTERVAL — каждые interval_minutes с start_time до end_time
    repeat_mode varchar(16) not null,
    start_time time,
    end_time time,
    interval_minutes int,
    enabled boolean not null,
    deleted boolean default false not null,
    created_at timestamp with time zone not null,
    updated_at timestamp with time zone not null,
    next_run_at timestamp with time zone,
    last_run_at timestamp with time zone
);

create index idx_campaign_next_run on campaign (enabled, deleted, next_run_at);

create table campaign_target (
    campaign_id varchar(64) not null references campaign (id),
    group_jid varchar(128) not null,
    constraint pk_campaign_target primary key (campaign_id, group_jid)
);

-- Рассылка знает свою заявку и своё окно: заявка «каждый день с 05:00» шлёт с 05:00, даже если общее окно с 08:00.
alter table request add column campaign_id varchar(64);
alter table request add column window_start time;
alter table request add column window_end time;
create index idx_request_campaign on request (campaign_id, queued_at);

-- Отложенная доставка: последнее сообщение в группе наше и свежее — ждём, пока кто-то напишет или пройдёт пауза.
alter table delivery add column not_before timestamp with time zone;
create index idx_delivery_updated on delivery (status, updated_at);

-- Группа есть в последнем списке групп номера. После привязки другого номера группы прежнего пропадают из списка.
alter table wa_group add column present boolean default true not null;

-- Настройки, которые меняются из админки; чего здесь нет — берётся из .env.
create table app_setting (
    name varchar(64) primary key,
    setting_value varchar(4000) not null,
    updated_at timestamp with time zone not null
);

-- Получатели уведомлений: человек пишет боту /start, администратор одобряет в админке.
create table telegram_subscriber (
    chat_id varchar(32) primary key,
    name varchar(200),
    username varchar(100),
    status varchar(16) not null,
    requested_at timestamp with time zone not null,
    decided_at timestamp with time zone
);

-- Кому и когда автоответчик уже ответил, чтобы не отвечать на каждое сообщение.
create table autoreply_log (
    contact_jid varchar(128) primary key,
    kind varchar(16) not null,
    replied_at timestamp with time zone not null
);

-- Прежние заявки становятся разовыми заявками с одной рассылкой.
insert into campaign (id, title, draft, message, targeted, target_label, repeat_mode, enabled, created_at, updated_at, last_run_at)
select id, 'Заявка №' || id, null, message, targeted, null, 'ONCE', false, queued_at, queued_at, queued_at
from request;

insert into campaign_target (campaign_id, group_jid)
select request_id, group_jid from request_target;

update request set campaign_id = id;
