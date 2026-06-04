import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  ClipboardList,
  FileText,
  Home,
  Package,
  PhoneCall,
  Plus,
  Printer,
  RefreshCcw,
  Save,
  Trash2,
  Truck,
  Pill,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, apiUrl } from "./api.js";
import { money, todayInputDate, uid, newSalesLine, newSupplierLine } from "./utils.js";
import { get, map } from "lodash";
import InventoryAlertTable from "./commons/InventoryAlertTable/InventoryAlertTable.jsx";
import MedicineSelect from "./commons/MedicineSelect/MedicineSelect.jsx";
import InvoicePage from "./pages/InvoicePage/InvoicePage.jsx";
import { ROUTES } from "../constants.js";
import fieldFunctions from "./commons/Fields/Fields.jsx";
import HomePage from "./pages/HomePage/HomePage.jsx";
import { TextField, NumberField, DateField, InlineAlert } from "./commons/Fields/Fields.jsx";
import MedicinesPage from "./pages/MedicinesPage/MedicinesPage.jsx";

export default function App() {
  const [view, setView] = useState("home");
  const [homeSummary, setHomeSummary] = useState(null);
  const [medicines, setMedicines] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [salesOrders, setSalesOrders] = useState([]);
  const [supplierOrders, setSupplierOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState("");
  const [bulkOrderInvoice, setBulkOrderInvoice] = useState(null);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    setApiError("");
    try {
      const [summary, medicineRows, inventoryRows, supplierRows, salesRows, supplierOrderRows] = await Promise.all([
        api("/home/summary"),
        api("/medicines"),
        api("/inventory"),
        api("/suppliers"),
        api("/sales-orders"),
        api("/supplier-orders"),
      ]);
      setHomeSummary(summary);
      setMedicines(medicineRows);
      setInventory(inventoryRows);
      setSuppliers(supplierRows);
      setSalesOrders(salesRows);
      setSupplierOrders(supplierOrderRows);
    } catch (error) {
      setApiError(error.message || "Unable to connect to the MEDTRACK backend.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  // Fixes navigation for bulk ordering & moving between tabs
  useEffect(() => {
    view != "invoice" && setBulkOrderInvoice(null);
  }, [view])

  useEffect(() => {
    // Once you have the data selected in bulkOrderInvoice - redirect to invoice page with the data needed to prefill the invoice form and line items.
    if (bulkOrderInvoice != null) {
      setView("invoice");
    }
  }, [bulkOrderInvoice]);

  return (
    <div className="min-h-screen">
      <header className="bg-white border-stone-300 border-b">
        <div className="flex md:flex-row flex-col md:justify-between md:items-center gap-3 mx-auto px-4 py-4 max-w-7xl">
          <div>
            <div className="font-bold text-stone-950 text-2xl tracking-normal"><button onClick={() => {
              // setBulkOrderInvoice(null)
              setView("home")
            }}>MEDTRACK</button></div>

            <div className="text-stone-600 text-sm">Inventory, sales receipts, and supplier order follow-up</div>
          </div>
          <nav className="flex flex-wrap gap-2">
            {
              map(ROUTES, (route) => (
                <NavButton
                  key={route.key}
                  active={view === route.key}
                  icon={route.icon}
                  label={route.label}
                  onClick={() => setView(route.key)}
                />
              ))
            }
            <button className="btn" onClick={refreshAll} type="button">
              <RefreshCcw size={18} />
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto px-4 py-5 max-w-7xl">
        <div className="flex md:flex-row flex-col md:justify-between md:items-center gap-2 mb-4">
          <StatusBar summary={homeSummary} loading={loading} error={apiError} />
        </div>

        {view === "home" && <HomePage summary={homeSummary} loading={loading} setView={setView} setBulkOrderInvoice={setBulkOrderInvoice} bulkOrderInvoice={bulkOrderInvoice} />}
        {view === "orders" && <OrdersPage medicines={medicines} salesOrders={salesOrders} onChanged={refreshAll} />}
        {view === "invoice" && (
          <InvoicePage
            medicines={medicines}
            suppliers={suppliers}
            supplierOrders={supplierOrders}
            bulkOrderInvoice={bulkOrderInvoice}
            onChanged={refreshAll}
          />
        )}
        {view === "medicines" && (
          <MedicinesPage medicines={medicines} inventory={inventory} onChanged={refreshAll} />
        )}
      </main>
    </div>
  );
}

function NavButton({ active, icon: Icon, label, onClick }) {
  return (
    <button
      className={`btn ${active ? "border-stone-950 bg-stone-950 text-white hover:bg-stone-900" : ""}`}
      onClick={onClick}
      type="button"
    >
      <Icon size={18} />
      {label}
    </button>
  );
}

function StatusBar({ summary, loading, error }) {
  if (error) {
    return <InlineAlert tone="error" text={error} />;
  }
  if (loading || !summary) {
    return <div className="text-stone-600 text-sm">Loading SQLite data...</div>;
  }
  return (
    <div className="flex flex-wrap gap-2 text-sm">
      <Metric label="Sales Value (Today)" value={`Rs ${money(summary.todaySalesValue)}`} />
      <Metric label="Sales Value (YTD)" value={`Rs ${money(summary.ytdSalesValue)}`} />
      <Metric label="Quantity Sold Today" value={summary.todayQtySold} />
      <Metric label="Alerts" value={summary.alerts?.length || 0} tone={summary.alerts?.length ? "warn" : "ok"} />
    </div>
  );
}

function OrdersPage({ medicines, salesOrders, onChanged }) {
  const [form, setForm] = useState({
    orderDate: todayInputDate(),
    customerName: "",
    customerPhone: "",
    discountAmount: "0",
  });
  const [lines, setLines] = useState([newSalesLine()]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const medicineById = useMemo(() => new Map(medicines.map((medicine) => [String(medicine.id), medicine])), [medicines]);

  const updateLine = (lineId, patch) => {
    setLines((current) => current.map((line) => (line.id === lineId ? { ...line, ...patch } : line)));
  };

  const selectMedicine = (lineId, medicineId) => {
    const medicine = medicineById.get(String(medicineId));
    updateLine(lineId, { medicineId, unitPrice: medicine?.sellingPrice || "" });
  };

  const submitOrder = async (event) => {
    event.preventDefault();
    setMessage("");
    setError("");
    try {
      const result = await api("/sales-orders", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          items: lines.map(({ medicineId, qtySold, unitPrice, discountAmount }) => ({
            medicineId,
            qtySold,
            unitPrice,
            discountAmount,
          })),
        }),
      });
      setMessage(`Saved ${result.orderNo}. Receipt PDF is ready.`);
      setLines([newSalesLine()]);
      setForm({ orderDate: todayInputDate(), customerName: "", customerPhone: "", discountAmount: "0" });
      await onChanged();
      window.open(apiUrl(result.receiptUrl), "_blank", "noopener");
    } catch (apiError) {
      setError((apiError.errors || [apiError.message || "Sales order failed."]).join(" "));
    }
  };

  return (
    <section className="gap-4 grid lg:grid-cols-[1fr_430px]">
      <form className="p-4 panel" onSubmit={submitOrder}>
        <div className="mb-4">
          <h1 className="font-bold text-stone-950 text-xl">Orders</h1>
          <p className="text-stone-600 text-sm">Create multi-medicine customer orders and print PDF receipts.</p>
        </div>
        <div className="gap-3 grid md:grid-cols-4">
          <DateField label="Order Date" value={form.orderDate} onChange={(value) => setForm({ ...form, orderDate: value })} />
          <TextField label="Customer Name" value={form.customerName} onChange={(value) => setForm({ ...form, customerName: value })} />
          <TextField label="Customer Phone" value={form.customerPhone} onChange={(value) => setForm({ ...form, customerPhone: value })} />
          <NumberField label="Order Discount" value={form.discountAmount} onChange={(value) => setForm({ ...form, discountAmount: value })} step="0.01" />
        </div>
        {/* Order Table */}
        <div className="space-y-3 mt-4">
          {map(lines, (line, index) => {
            const { medicineId, qtySold, unitPrice, discountAmount } = line;
            const linetotal = (Number(qtySold || 0) * Number(unitPrice || 0)) - Number(discountAmount || 0);
            return (
              <div className="bg-stone-50 p-3 border border-stone-300 rounded-md" key={line.id}>
                <div className="flex justify-between items-center mb-2">
                  <div className="font-semibold">Medicine {index + 1}</div>
                  <button className="px-2 h-8 btn" disabled={lines.length === 1} onClick={() => setLines(lines.filter((item) => item.id !== line.id))} type="button">
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="gap-3 grid md:grid-cols-[2fr_75px_75px_75px_75px]">
                  <MedicineSelect medicines={medicines} value={line.medicineId} onChange={(value) => selectMedicine(line.id, value)} />
                  <NumberField label="Qty" value={line.qtySold} onChange={(value) => updateLine(line.id, { qtySold: value })} />
                  {/* onChange={(value) => updateLine(line.id, { unitPrice: value })} */}
                  <NumberField label="Unit Price" value={line.unitPrice} readOnly />
                  <NumberField label="Discount" value={line.discountAmount} onChange={(value) => updateLine(line.id, { discountAmount: value })} step="0.01" />
                  <NumberField label="Line Total" value={linetotal} readOnly />
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex md:flex-row flex-col md:justify-between gap-3 mt-4">
          <button className="btn" onClick={() => setLines([...lines, newSalesLine()])} type="button">
            <Plus size={18} />
            Add Medicine
          </button>
          <button className="btn btn-primary" type="submit">
            <Save size={18} />
            Save Order And Print Receipt
          </button>
        </div>
        {message && <InlineAlert tone="ok" text={message} />}
        {error && <InlineAlert tone="error" text={error} />}
      </form>

      <RecentSalesOrders orders={salesOrders} />
    </section>
  );
}

function RecentSalesOrders({ orders }) {
  return (
    <div className="overflow-hidden panel">
      <div className="px-4 py-3 border-stone-200 border-b">
        <h2 className="font-bold text-stone-950 text-lg">Recent Receipts</h2>
      </div>
      <div className="max-h-[720px] overflow-auto">
        {orders.map((order) => (
          <div className="p-3 border-stone-200 border-b" key={order.id}>
            <div className="flex justify-between items-center gap-2">
              <div>
                <div className="font-semibold">{order.orderNo}</div>
                <div className="text-stone-600 text-xs">{order.orderDate} | Rs {money(order.totalAmount)}</div>
              </div>
              <button className="h-9 btn" onClick={() => window.open(apiUrl(order.receiptUrl), "_blank", "noopener")} type="button">
                <Printer size={16} />
                PDF
              </button>
            </div>
          </div>
        ))}
        {orders.length === 0 && <div className="p-4 text-stone-600 text-sm">No sales orders yet.</div>}
      </div>
    </div>
  );
}

// Feature - 3: Changing this to allow search functionality in the medicine select dropdown for orders and supplier invoices
/*function MedicineSelect({ medicines, value, onChange }) {
  return (
    <div>
      <label className="label">Medicine</label>
      <select className="field" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Select medicine</option>
        {map(medicines, (medicine) => (
          <option key={medicine.id} value={medicine.id}>
            {medicine.skuName} ({medicine.currentUnits ?? 0} units)
          </option>
        ))}
      </select>
    </div>
  );
}*/

function CallIcon({ phone }) {
  if (!phone) {
    return <span className="text-stone-500">-</span>;
  }

  return (
    <span className="inline-flex justify-center items-center bg-white border border-stone-300 rounded-md w-8 h-8 text-stone-800" title={phone}>
      <PhoneCall size={17} />
    </span>
  );
}

function SummaryTile({ label, value }) {
  return (
    <div className="p-4 panel">
      <div className="font-semibold text-stone-600 text-xs uppercase tracking-normal">{label}</div>
      <div className="mt-1 font-bold text-stone-950 text-2xl">{value}</div>
    </div>
  );
}

function Metric({ label, value, tone = "default" }) {
  const toneClass =
    tone === "warn"
      ? "border-amber-400 bg-amber-50 text-amber-900"
      : tone === "ok"
        ? "border-emerald-300 bg-emerald-50 text-emerald-900"
        : "border-stone-300 bg-white text-stone-800";
  return (
    <div className={`rounded-md border px-3 py-2 ${toneClass}`}>
      <span className="font-semibold">{label}:</span> {value}
    </div>
  );
}
