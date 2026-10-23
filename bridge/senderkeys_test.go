package main

import (
	"context"
	"path/filepath"
	"slices"
	"testing"

	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/store"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
)

var (
	group     = types.NewJID("120363000000000001", types.GroupServer)
	otherGrp  = types.NewJID("120363000000000002", types.GroupServer)
	ownDevice = types.NewADJID("77000000000", 0, 11)
	ownLID    = types.NewADJID("101980000000000", 0, 11)
)

func testKeys(t *testing.T, groups string, limit int) *clientSenderKeys {
	t.Helper()
	keys, err := openSenderKeyRecipients(filepath.Join(t.TempDir(), "keys.db"), groups, limit)
	if err != nil {
		t.Fatal(err)
	}
	cli := whatsmeow.NewClient(&store.Device{ID: &ownDevice, LID: ownLID}, nil)
	return keys.forClient(cli)
}

func lidDevice(user string, device uint16) types.JID {
	return types.JID{User: user, Device: device, Server: types.HiddenUserServer}
}

func TestDisabledGroupGetsEveryDeviceAndIsNotRemembered(t *testing.T) {
	keys := testKeys(t, group.String(), 1)
	devices := []types.JID{lidDevice("1", 0), lidDevice("2", 0)}

	missing, err := keys.FilterMissing(context.Background(), otherGrp, devices)
	if err != nil || !slices.Equal(missing, devices) {
		t.Fatalf("missing = %v, %v", missing, err)
	}
	if err := keys.MarkDistributed(context.Background(), otherGrp, devices); err != nil {
		t.Fatal(err)
	}
	if known, _ := keys.distributed(context.Background(), otherGrp); len(known) != 0 {
		t.Fatalf("known = %v", known)
	}
}

func TestKeyGoesToOwnDevicesFirstAndOnlyOnce(t *testing.T) {
	ctx := context.Background()
	keys := testKeys(t, "all", 2)
	phone := lidDevice(ownLID.User, 0)
	devices := []types.JID{lidDevice("1", 0), lidDevice("2", 0), phone}

	first, err := keys.FilterMissing(ctx, group, devices)
	if err != nil || !slices.Equal(first, []types.JID{phone, lidDevice("1", 0)}) {
		t.Fatalf("first = %v, %v", first, err)
	}
	if err := keys.MarkDistributed(ctx, group, first); err != nil {
		t.Fatal(err)
	}
	second, err := keys.FilterMissing(ctx, group, devices)
	if err != nil || !slices.Equal(second, []types.JID{lidDevice("2", 0)}) {
		t.Fatalf("second = %v, %v", second, err)
	}
}

func TestRetryReceiptRemembersDevice(t *testing.T) {
	ctx := context.Background()
	keys := testKeys(t, "all", 10)
	device := lidDevice("3", 5)

	keys.markRetry(&events.Receipt{MessageSource: types.MessageSource{Chat: group, Sender: device, IsGroup: true}})

	missing, err := keys.FilterMissing(ctx, group, []types.JID{device})
	if err != nil || len(missing) != 0 {
		t.Fatalf("missing = %v, %v", missing, err)
	}
}
