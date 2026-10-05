-- Сколько раз отправка в группу уже отклонялась сервером и ставилась на повтор.
alter table delivery add column attempts int default 0 not null;
