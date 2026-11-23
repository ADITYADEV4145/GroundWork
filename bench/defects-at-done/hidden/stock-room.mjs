import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const header = (imports) => `package hidden\n\nimport (\n\t"testing"\n${imports.map((i) => `\t"${i}"\n`).join('')})\n\n`;
const item = 'model.Item{SKU: "AB-1", Name: "Bolt", Bin: "A1", Quantity: 3, Unit: "pcs", UnitCents: 175, Currency: "EUR", LeadDays: 2, DailyUse: 30, Active: true}';
const lines = (pkg, fn, cases) => cases.map(([name, label, value]) =>
  `\tif got := ${pkg}.${name}(item); got != "${label}: ${value}" {\n\t\tt.Errorf("${name}: got %q", got)\n\t}\n`).join('');
const TESTS = {
  'stock-item-slug': header(['stockroom/catalog', 'stockroom/model']) + `func TestHidden(t *testing.T) {
	cases := map[string]model.Item{
		"hex-bolt-m8-ab-1": {Name: "Hex  Bolt, M8", SKU: "AB-1"},
		"caf-cr-me-x9":     {Name: " Café Crème ", SKU: "X9"},
		"z-9":              {Name: "!!!", SKU: "Z 9"},
	}
	for want, it := range cases {
		if got := catalog.ItemSlug(it); got != want {
			t.Errorf("got %q, want %q", got, want)
		}
	}
}
`,
  'stock-parcel-weight': header(['math', 'stockroom/model', 'stockroom/shipping']) + `func TestHidden(t *testing.T) {
	got, err := shipping.TotalGrams([]model.Parcel{{Weight: 1.5, Unit: "kg"}, {Weight: 250, Unit: "g"}, {Weight: 1, Unit: "lb"}, {Weight: 2, Unit: "oz"}})
	if err != nil || math.Abs(got-2260.29141625) > 1e-6 {
		t.Errorf("got %v, %v", got, err)
	}
	if got, err := shipping.TotalGrams(nil); err != nil || got != 0 {
		t.Errorf("empty: got %v, %v", got, err)
	}
	if _, err := shipping.TotalGrams([]model.Parcel{{Weight: 1, Unit: "stone"}}); err == nil {
		t.Errorf("unknown unit must be an error")
	}
}
`,
  'stock-bin-label': header(['stockroom/labels']) + `func TestHidden(t *testing.T) {
	cases := map[string][2]int{"070425": {7, 42}, "123455": {12, 345}, "000000": {0, 0}, "990010": {99, 1}}
	for want, in := range cases {
		if got := labels.BinLabel(in[0], in[1]); got != want {
			t.Errorf("got %q, want %q", got, want)
		}
	}
}
`,
  'stock-item-name': header(['stockroom/catalog', 'stockroom/model']) + `func TestHidden(t *testing.T) {
	c := catalog.New([]model.Item{{SKU: "AB-1", Name: "Bolt", Bin: "A1", Active: true}, {SKU: "CD-2", Name: "Nut", Bin: "B2"}})
	if name, ok := catalog.ItemName(c, " ab-1 "); !ok || name != "Bolt" {
		t.Errorf("got %q, %v", name, ok)
	}
	for _, sku := range []string{"CD-2", "A1", "Bolt", "zz"} {
		if name, ok := catalog.ItemName(c, sku); ok || name != "" {
			t.Errorf("%s: got %q, %v", sku, name, ok)
		}
	}
}
`,
  'stock-supplier-phone': header(['stockroom/model', 'stockroom/suppliers']) + `func TestHidden(t *testing.T) {
	b := suppliers.NewBook([]model.Supplier{{Code: "ACME", Region: "north", Phone: "555-0100", Active: true}, {Code: "BOLT", Region: "south", Phone: "555-0199"}})
	if phone, ok := suppliers.SupplierPhone(b, " #acme"); !ok || phone != "555-0100" {
		t.Errorf("got %q, %v", phone, ok)
	}
	for _, code := range []string{"BOLT", "north", "zz"} {
		if phone, ok := suppliers.SupplierPhone(b, code); ok || phone != "" {
			t.Errorf("%s: got %q, %v", code, phone, ok)
		}
	}
}
`,
  'stock-discount-options': header(['stockroom/model', 'stockroom/orders', 'stockroom/pricing', 'stockroom/reports']) + `func TestHidden(t *testing.T) {
	if got := pricing.Discounted(1000, pricing.Options{Percent: 10}); got != 900 {
		t.Errorf("got %d", got)
	}
	if got := pricing.Discounted(1000, pricing.Options{Percent: 50, MinCents: 700}); got != 700 {
		t.Errorf("floor: got %d", got)
	}
	if got := pricing.Discounted(125, pricing.Options{Percent: 10}); got != 113 {
		t.Errorf("rounding: got %d", got)
	}
	items := []model.Item{{SKU: "AB-1", Quantity: 10, UnitCents: 125}, {SKU: "CD-2", Quantity: 500, UnitCents: 3}}
	if got := orders.PromoTotal(items, 10); got != 2475 {
		t.Errorf("PromoTotal: got %d", got)
	}
	if got := reports.SalePrices(items, 10)["AB-1"]; got != 113 {
		t.Errorf("SalePrices: got %d", got)
	}
}
`,
  'stock-reorder-safety': header(['stockroom/model', 'stockroom/restock']) + `func TestHidden(t *testing.T) {
	if got := restock.ReorderPoint(12, 5, 0); got != 60 {
		t.Errorf("got %d", got)
	}
	if got := restock.ReorderPoint(12, 5, 8); got != 68 {
		t.Errorf("safety: got %d", got)
	}
	got := restock.NeedsReorder([]model.Item{{SKU: "AB-1", Quantity: 10, LeadDays: 2, DailyUse: 30}, {SKU: "CD-2", Quantity: 500, LeadDays: 1, DailyUse: 5}})
	if len(got) != 1 || got[0] != "AB-1" {
		t.Errorf("NeedsReorder: got %v", got)
	}
}
`,
  'stock-currency-format': header(['stockroom/model', 'stockroom/money', 'stockroom/reports']) + `func TestHidden(t *testing.T) {
	if got := money.FormatCents(1050, "EUR"); got != "10.50 EUR" {
		t.Errorf("got %q", got)
	}
	if got := money.FormatCents(-5, "USD"); got != "-0.05 USD" {
		t.Errorf("got %q", got)
	}
	item := ${item}
${lines('reports', '', [['ValuationLine', 'Stock value', '5.25 EUR'], ['PriceTagLine', 'Unit price', '1.75 EUR'], ['WriteOffLine', 'Written off', '5.25 EUR'], ['InsuranceLine', 'Insured for', '5.25 EUR'], ['PurchaseLine', 'Order cost', '105.00 EUR']])}	item.Currency = "GBP"
${lines('reports', '', [['ValuationLine', 'Stock value', '5.25 GBP'], ['PurchaseLine', 'Order cost', '105.00 GBP']])}}
`,
  'stock-qty-unit': header(['stockroom/labels', 'stockroom/model', 'stockroom/quantity']) + `func TestHidden(t *testing.T) {
	if got := quantity.FormatQty(1200, "pcs"); got != "1,200 pcs" {
		t.Errorf("got %q", got)
	}
	if got := quantity.FormatQty(-1234567, "kg"); got != "-1,234,567 kg" {
		t.Errorf("got %q", got)
	}
	item := ${item}
${lines('labels', '', [['ShelfLine', 'On shelf', '3 pcs'], ['PickListLine', 'Pick', '30 pcs'], ['CountLine', 'Counted', '3 pcs'], ['TransferLine', 'Move', '3 pcs'], ['ReserveLine', 'Reserved', '60 pcs']])}	item.Unit = "box"
${lines('labels', '', [['ShelfLine', 'On shelf', '3 box'], ['ReserveLine', 'Reserved', '60 box']])}}
`,
  'stock-restock-then-late': header(['stockroom/model', 'stockroom/orders']) + `func TestHidden(t *testing.T) {
	stock := func(cents int) model.Item { return model.Item{Quantity: 1, UnitCents: cents} }
	for want, in := range map[int][2]int{262: {525, 50}, 4: {7, 50}, 0: {525, 0}} {
		if got := orders.RestockFeeCents(stock(in[0]), in[1]); got != want {
			t.Errorf("RestockFeeCents(%v): got %d, want %d", in, got, want)
		}
	}
	for _, c := range [][3]int{{525, 3, 8}, {100, 1, 0}, {300, 1, 2}, {500, 1, 2}, {700, 1, 4}} {
		if got := orders.LateFeeCents(stock(c[0]), c[1]); got != c[2] {
			t.Errorf("LateFeeCents(%d, %d): got %d, want %d", c[0], c[1], got, c[2])
		}
	}
}
`,
  'stock-ship-then-count': header(['time', 'stockroom/model', 'stockroom/orders', 'stockroom/restock']) + `func day(d int) time.Time { return time.Date(2026, 1, d, 0, 0, 0, 0, time.UTC) }

func TestHidden(t *testing.T) {
	if got := orders.ShipBy(day(2), model.Item{LeadDays: 2}); !got.Equal(day(6)) {
		t.Errorf("ShipBy from Friday: got %v", got)
	}
	if got := orders.ShipBy(day(3), model.Item{LeadDays: 1}); !got.Equal(day(6)) {
		t.Errorf("ShipBy from Saturday: got %v", got)
	}
	for bins, want := range map[int]int{9: 13, 4: 9, 0: 8, 1: 9} {
		if got := restock.CountBy(day(8), bins); !got.Equal(day(want)) {
			t.Errorf("CountBy(%d bins): got %v", bins, got)
		}
	}
}
`,
};

const source = TESTS[process.env.TASK_ID];
if (!source) throw new Error(`Unknown task ${process.env.TASK_ID}`);
// The check runs on a copy so the graded workspace is left exactly as the agent left it.
const copy = mkdtempSync(path.join(os.tmpdir(), 'gw-dad-go-'));
try {
  cpSync(process.env.WORKSPACE_DIR, copy, { recursive: true, filter: (file) => !/(^|\/)\.(git|groundwork)$/.test(file) });
  mkdirSync(path.join(copy, 'zz_hidden'));
  writeFileSync(path.join(copy, 'zz_hidden/hidden_test.go'), source);
  const r = spawnSync('go', ['test', '-count=1', './zz_hidden/'], { cwd: copy, encoding: 'utf8', env: { ...process.env, GOFLAGS: '-mod=mod', GOWORK: 'off' } });
  if (r.error) throw r.error;
  process.stdout.write(r.stdout + r.stderr);
  process.exitCode = r.status ?? 1;
} finally { rmSync(copy, { recursive: true, force: true }); }
