-- Доп. отправки в течение дня к повтору («ещё в 05:00»), через запятую: 05:00,06:30
alter table campaign add column extra_times varchar(64);
-- Слать и вне общего рабочего окна
alter table campaign add column any_time boolean default false not null;
