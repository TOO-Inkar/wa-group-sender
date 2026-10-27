package main

import (
	"context"
	"database/sql"
	"errors"

	"go.mau.fi/whatsmeow/store"
	"go.mau.fi/whatsmeow/store/sqlstore"
	"go.mau.fi/whatsmeow/types"
	waLog "go.mau.fi/whatsmeow/util/log"
)

type devices struct {
	container *sqlstore.Container
	db        *sql.DB
}

func openStore(ctx context.Context, dsn string, log waLog.Logger) (*devices, error) {
	db, err := sql.Open("sqlite3", dsn)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(storeMaxOpenConns)
	container := sqlstore.NewWithDB(db, "sqlite3", log)
	if err := container.Upgrade(ctx); err != nil {
		_ = container.Close()
		return nil, err
	}
	if _, err := db.ExecContext(ctx, `create table if not exists bridge_session (
		session text primary key, device text not null unique)`); err != nil {
		_ = container.Close()
		return nil, err
	}
	return &devices{container: container, db: db}, nil
}

func (d *devices) mapped(ctx context.Context) (map[string]string, error) {
	rows, err := d.db.QueryContext(ctx, `select session, device from bridge_session`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]string{}
	for rows.Next() {
		var key, device string
		if err := rows.Scan(&key, &device); err != nil {
			return nil, err
		}
		out[key] = device
	}
	return out, rows.Err()
}

func (d *devices) mappedDevice(ctx context.Context, key string) (types.JID, bool, error) {
	var device string
	err := d.db.QueryRowContext(ctx, `select device from bridge_session where session = ?`, key).Scan(&device)
	if errors.Is(err, sql.ErrNoRows) {
		return types.EmptyJID, false, nil
	}
	if err != nil {
		return types.EmptyJID, false, err
	}
	jid, err := types.ParseJID(device)
	return jid, err == nil, err
}

func (d *devices) bind(ctx context.Context, key string, jid types.JID) error {
	_, err := d.db.ExecContext(ctx, `insert into bridge_session(session, device) values (?, ?)
		on conflict(session) do update set device = excluded.device`, key, jid.String())
	return err
}

func (d *devices) adoptLegacy(ctx context.Context, key string) (types.JID, error) {
	existing, err := d.mapped(ctx)
	if err != nil || len(existing) > 0 {
		return types.EmptyJID, err
	}
	all, err := d.container.GetAllDevices(ctx)
	if err != nil || len(all) == 0 {
		return types.EmptyJID, err
	}
	jid := *all[0].ID
	return jid, d.bind(ctx, key, jid)
}

func (d *devices) device(ctx context.Context, key string) (*store.Device, error) {
	jid, ok, err := d.mappedDevice(ctx, key)
	if err != nil {
		return nil, err
	}
	if ok {
		device, err := d.container.GetDevice(ctx, jid)
		if err != nil {
			return nil, err
		}
		if device != nil {
			return device, nil
		}
		if _, err := d.db.ExecContext(ctx, `delete from bridge_session where session = ?`, key); err != nil {
			return nil, err
		}
	}
	return d.container.NewDevice(), nil
}

func (d *devices) forget(ctx context.Context, key string) error {
	jid, ok, err := d.mappedDevice(ctx, key)
	if err != nil {
		return err
	}
	if ok {
		device, err := d.container.GetDevice(ctx, jid)
		if err != nil {
			return err
		}
		if device != nil {
			if err := device.Delete(ctx); err != nil {
				return err
			}
		}
	}
	_, err = d.db.ExecContext(ctx, `delete from bridge_session where session = ?`, key)
	return err
}

func (d *devices) close() error {
	return d.container.Close()
}

func openLastMessages(path string) (*sql.DB, error) {
	db, err := sql.Open("sqlite3", "file:"+path+"?_journal_mode=WAL&_synchronous=NORMAL&_busy_timeout=10000")
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	_, err = db.Exec(`create table if not exists last_message (
		jid text primary key, from_me integer not null, at integer not null)`)
	return db, err
}
