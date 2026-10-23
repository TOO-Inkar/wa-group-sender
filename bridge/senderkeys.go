package main

import (
	"context"
	"database/sql"
	"log/slog"
	"slices"
	"strings"

	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
)

type senderKeyRecipients struct {
	db     *sql.DB
	groups map[string]bool
	limit  int
}

type clientSenderKeys struct {
	*senderKeyRecipients
	cli *whatsmeow.Client
}

func openSenderKeyRecipients(path, groups string, limit int) (*senderKeyRecipients, error) {
	db, err := sql.Open("sqlite3", "file:"+path+"?_journal_mode=WAL&_synchronous=NORMAL&_busy_timeout=10000")
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	_, err = db.Exec(`create table if not exists sender_key_recipient (
		own text not null, grp text not null, device text not null, primary key (own, grp, device))`)
	if err != nil {
		return nil, err
	}
	return &senderKeyRecipients{db: db, groups: parseGroups(groups), limit: limit}, nil
}

func parseGroups(value string) map[string]bool {
	groups := map[string]bool{}
	for _, jid := range strings.Split(value, ",") {
		if jid = strings.TrimSpace(jid); jid != "" {
			groups[jid] = true
		}
	}
	return groups
}

func (s *senderKeyRecipients) forClient(cli *whatsmeow.Client) *clientSenderKeys {
	return &clientSenderKeys{senderKeyRecipients: s, cli: cli}
}

func (s *senderKeyRecipients) enabled(group types.JID) bool {
	return s.groups["all"] || s.groups[group.String()]
}

func (c *clientSenderKeys) FilterMissing(ctx context.Context, group types.JID, devices []types.JID) ([]types.JID, error) {
	if !c.enabled(group) {
		return devices, nil
	}
	known, err := c.distributed(ctx, group)
	if err != nil {
		return nil, err
	}
	missing := slices.DeleteFunc(slices.Clone(devices), func(device types.JID) bool { return known[device.String()] })
	slices.SortStableFunc(missing, func(a, b types.JID) int { return selfFirst(c.cli, a) - selfFirst(c.cli, b) })
	if len(missing) > c.limit {
		missing = missing[:c.limit]
	}
	slog.Info("SENDER KEY recipients", "group", group.String(), "devices", len(devices), "known", len(known), "sending", len(missing))
	return missing, nil
}

func selfFirst(cli *whatsmeow.Client, device types.JID) int {
	if isSelf(cli, device) {
		return 0
	}
	return 1
}

func (c *clientSenderKeys) distributed(ctx context.Context, group types.JID) (map[string]bool, error) {
	rows, err := c.db.QueryContext(ctx, `select device from sender_key_recipient where own = ? and grp = ?`, c.own(), group.String())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	known := map[string]bool{}
	for rows.Next() {
		var device string
		if err := rows.Scan(&device); err != nil {
			return nil, err
		}
		known[device] = true
	}
	return known, rows.Err()
}

func (c *clientSenderKeys) MarkDistributed(ctx context.Context, group types.JID, devices []types.JID) error {
	if !c.enabled(group) {
		return nil
	}
	tx, err := c.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	for _, device := range devices {
		if _, err := tx.ExecContext(ctx, `insert or ignore into sender_key_recipient(own, grp, device) values (?, ?, ?)`,
			c.own(), group.String(), device.String()); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (c *clientSenderKeys) markRetry(receipt *events.Receipt) {
	if !receipt.IsGroup {
		return
	}
	if err := c.MarkDistributed(context.Background(), receipt.Chat, []types.JID{receipt.Sender}); err != nil {
		slog.Warn("SENDER KEY retry not remembered", "group", receipt.Chat.String(), "device", receipt.Sender.String(), "err", err)
		return
	}
	if c.enabled(receipt.Chat) {
		slog.Info("SENDER KEY retry", "group", receipt.Chat.String(), "device", receipt.Sender.String())
	}
}

func (c *clientSenderKeys) own() string {
	return c.cli.Store.GetJID().String()
}
