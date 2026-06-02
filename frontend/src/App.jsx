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
import { PillButton } from "./Pill/PillButton.jsx";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, apiUrl } from "./api.js";
import { money, todayInputDate } from "./utils.js";
import { get, map } from "lodash";
import InventoryAlertTable from "./InventoryAlertTable/InventoryAlertTable.jsx";
import MedicineSelect from "./commons/MedicineSelect/MedicineSelect.jsx";

const STATUS_OPTIONS = [
  "draft",
  "sent",
  "awaiting confirmation",
  "confirmed",
  "partially received",
  "received",
  "cancelled",
  "overdue",
];
const PILL_OPTIONS = [
  {
    label: "Low Supply",
    value: "low-supply",
    property: "lowStockMedicines",
    styling: "bg-red-100 text-red-800 border-red-300 hover:bg-red-200",
  },
  {
    label: "Refill Soon",
    value: "Refill Soon",
    property: "refillSoonMedicines",
    styling: "bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200",
  }
];

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function newSalesLine() {
  return { id: uid(), medicineId: "", qtySold: "1", unitPrice: "", discountAmount: "0" };
}

function newSupplierLine() {
  return { id: uid(), medicineId: "", qtyOrdered: "1", committedUnitPrice: "", discountAmount: "0" };
}

function emptyMedicineForm() {
  return {
    skuCode: "",
    skuName: "",
    medicineName: "",
    category: "",
    brand: "",
    form: "",
    strength: "",
    packSize: "",
    costPrice: "",
    sellingPrice: "",
    currentUnits: "0",
    replenishmentLevel: "0",
    refillBufferUnits: "0",
  };
}

function emptySupplierForm() {
  return { supplierName: "", phone: "", contactPerson: "", reliabilityRating: "3" };
}

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

  return (
    <div className="min-h-screen">
      <header className="bg-white border-stone-300 border-b">
        <div className="flex md:flex-row flex-col md:justify-between md:items-center gap-3 mx-auto px-4 py-4 max-w-7xl">
          <div>
            <div className="font-bold text-stone-950 text-2xl tracking-normal"><button onClick={() => setView("home")}>MEDTRACK</button></div>
            <div className="text-stone-600 text-sm">Inventory, sales receipts, and supplier order follow-up</div>
          </div>
          <nav className="flex flex-wrap gap-2">
            <NavButton active={view === "home"} icon={Home} onClick={() => setView("home")} />
            <NavButton active={view === "orders"} icon={ClipboardList} label="Orders" onClick={() => setView("orders")} />
            <NavButton active={view === "invoice"} icon={FileText} label="Invoice" onClick={() => setView("invoice")} />
            <NavButton active={view === "medicines"} icon={Pill} label="Medicines" onClick={() => setView("medicines")} />
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

        {view === "home" && <HomePage summary={homeSummary} loading={loading} />}
        {view === "orders" && <OrdersPage medicines={medicines} salesOrders={salesOrders} onChanged={refreshAll} />}
        {view === "invoice" && (
          <InvoicePage
            medicines={medicines}
            suppliers={suppliers}
            supplierOrders={supplierOrders}
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

function HomePage({ summary, loading }) {
  const [activeTab, setActiveTab] = useState("Refill Soon");

  if (loading || !summary) {
    return <div className="p-4 text-stone-600 text-sm panel">Loading home summary...</div>;
  }

  let { pendingSupplierOrders, pendingSupplierOrdersTotal, pendingSupplierOrdersPage, pendingSupplierOrdersPageSize } = summary;
  return (
    <section className="space-y-4">
      {/* Pending Supplier Orders - Show a reason as to why these are alerts */}
      <div className="gap-4 grid lg:grid-cols-1">
        <PendingSupplierPanel
          orders={pendingSupplierOrders || []}
          total={pendingSupplierOrdersTotal || 0}
          page={pendingSupplierOrdersPage || 1}
          pageSize={pendingSupplierOrdersPageSize || 10}
        />
      </div>
      {/* Inventory tables for Low Supply and Refill Soon Inventory */}
      <div className="gap-4 grid lg:grid-cols-1">
        <PillButton options={PILL_OPTIONS} onChange={setActiveTab} selectedTab={activeTab} />
        {PILL_OPTIONS.map((option) => {
          const { value, label, property, styling } = option;
          return activeTab === value && (
            <InventoryAlertTable
              title={`${label} (${get(summary, property, "").length || 0})`}
              icon={AlertTriangle}
              rows={get(summary, property, "") || []}
              bg={styling}
            />);
        })}
      </div>
    </section>
  );
}

function PendingSupplierPanel({ orders, total, page, pageSize }) {
  return (
    <div className="overflow-hidden panel">
      <div className="flex items-center gap-2 px-4 py-3 border-stone-200 border-b">
        <Truck size={20} />
        <h2 className="font-bold text-stone-950 text-lg">Supplier Orders To Confirm</h2>
      </div>
      <div className="max-h-[255px] overflow-auto">
        <table className="w-full min-w-[590px] border-collapse">
          <thead className="table-head">
            <tr>
              <th className="px-3 py-2">Supplier</th>
              <th className="px-3 py-2">Call</th>
              <th className="px-3 py-2">Deadline</th>
              <th className="px-3 py-2">Value</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr className="bg-white" key={order.id}>
                <td className="table-cell">{order.supplierName}</td>
                <td className="table-cell"><CallIcon phone={order.followUpPhone || order.supplierPhone} /></td>
                <td className="table-cell">{order.expectedDeliveryDate}</td>
                <td className="table-cell">Rs {money(order.totalCommittedValue)}</td>
                <td className="table-cell">{order.status}</td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr>
                <td className="table-cell text-stone-600" colSpan="5">No supplier orders awaiting confirmation.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2 border-stone-200 border-t text-stone-600 text-xs">
        Page {page}; showing up to {pageSize} of {total}.
      </div>
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

function InvoicePage({ medicines, suppliers, supplierOrders, onChanged }) {
  const [supplierForm, setSupplierForm] = useState(emptySupplierForm());
  const [orderForm, setOrderForm] = useState({
    supplierId: "",
    orderDate: todayInputDate(),
    expectedDeliveryDate: todayInputDate(),
    status: "sent",
    discountAmount: "0",
    notes: "",
  });
  const [lines, setLines] = useState([newSupplierLine()]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const medicineById = useMemo(() => new Map(medicines.map((medicine) => [String(medicine.id), medicine])), [medicines]);

  const saveSupplier = async (event) => {
    event.preventDefault();
    setMessage("");
    setError("");
    try {
      await api("/suppliers", { method: "POST", body: JSON.stringify(supplierForm) });
      setSupplierForm(emptySupplierForm());
      setMessage("Supplier saved.");
      await onChanged();
    } catch (apiError) {
      setError((apiError.errors || [apiError.message || "Supplier save failed."]).join(" "));
    }
  };

  const updateLine = (lineId, patch) => {
    setLines((current) => current.map((line) => (line.id === lineId ? { ...line, ...patch } : line)));
  };

  const selectMedicine = (lineId, medicineId) => {
    const medicine = medicineById.get(String(medicineId));
    updateLine(lineId, { medicineId, committedUnitPrice: medicine?.costPrice || "" });
  };

  const saveSupplierOrder = async (event) => {
    event.preventDefault();
    setMessage("");
    setError("");
    try {
      const result = await api("/supplier-orders", {
        method: "POST",
        body: JSON.stringify({
          ...orderForm,
          items: lines.map(({ medicineId, qtyOrdered, committedUnitPrice, discountAmount }) => ({
            medicineId,
            qtyOrdered,
            committedUnitPrice,
            discountAmount,
          })),
        }),
      });
      setMessage(`Saved ${result.poNo}. Supplier invoice PDF is ready.`);
      setLines([newSupplierLine()]);
      setOrderForm({
        supplierId: "",
        orderDate: todayInputDate(),
        expectedDeliveryDate: todayInputDate(),
        status: "sent",
        discountAmount: "0",
        notes: "",
      });
      await onChanged();
      window.open(apiUrl(result.invoiceUrl), "_blank", "noopener");
    } catch (apiError) {
      setError((apiError.errors || [apiError.message || "Supplier order failed."]).join(" "));
    }
  };

  return (
    <section className="space-y-4">
      <div className="gap-4 grid lg:grid-cols-[360px_1fr]">
        <form className="p-4 panel" onSubmit={saveSupplier}>
          <h1 className="mb-1 font-bold text-stone-950 text-xl">Suppliers</h1>
          <p className="mb-4 text-stone-600 text-sm">Add suppliers with follow-up phone and reliability rating.</p>
          <div className="gap-3 grid">
            <TextField label="Supplier Name" value={supplierForm.supplierName} onChange={(value) => setSupplierForm({ ...supplierForm, supplierName: value })} />
            <TextField label="Phone" value={supplierForm.phone} onChange={(value) => setSupplierForm({ ...supplierForm, phone: value })} />
            <TextField label="Contact Person" value={supplierForm.contactPerson} onChange={(value) => setSupplierForm({ ...supplierForm, contactPerson: value })} />
            <NumberField label="Reliability 1-5" value={supplierForm.reliabilityRating} onChange={(value) => setSupplierForm({ ...supplierForm, reliabilityRating: value })} />
          </div>
          <button className="mt-4 w-full btn btn-primary" type="submit">
            <Save size={18} />
            Save Supplier
          </button>
        </form>

        <form className="p-4 panel" onSubmit={saveSupplierOrder}>
          <h1 className="mb-1 font-bold text-stone-950 text-xl">Supplier Order Invoice</h1>
          <p className="mb-4 text-stone-600 text-sm">Place supplier orders, track confirmation, deadlines, and receipts.</p>
          <div className="gap-3 grid md:grid-cols-5">
            <div>
              <label className="label">Supplier</label>
              <select className="field" value={orderForm.supplierId} onChange={(event) => setOrderForm({ ...orderForm, supplierId: event.target.value })}>
                <option value="">Select supplier</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>{supplier.supplierName}</option>
                ))}
              </select>
            </div>
            <DateField label="Order Date" value={orderForm.orderDate} onChange={(value) => setOrderForm({ ...orderForm, orderDate: value })} />
            <DateField label="Deadline" value={orderForm.expectedDeliveryDate} onChange={(value) => setOrderForm({ ...orderForm, expectedDeliveryDate: value })} />
            <div>
              <label className="label">Status</label>
              <select className="field" value={orderForm.status} onChange={(event) => setOrderForm({ ...orderForm, status: event.target.value })}>
                {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </div>
            <NumberField label="Order Discount" value={orderForm.discountAmount} onChange={(value) => setOrderForm({ ...orderForm, discountAmount: value })} step="0.01" />
          </div>
          <div className="mt-3">
            <TextField label="Notes" value={orderForm.notes} onChange={(value) => setOrderForm({ ...orderForm, notes: value })} />
          </div>
          {/* Invoice Table */}
          <div className="space-y-3 mt-4">
            {map(lines, (line, index) => {
              const { medicineId, qtyOrdered, committedUnitPrice, discountAmount } = line;
              const linetotal = (Number(qtyOrdered || 0) * Number(committedUnitPrice || 0)) - Number(discountAmount || 0);
              return (
                <div className="bg-stone-50 p-3 border border-stone-300 rounded-md" key={line.id}>
                  <div className="flex justify-between items-center mb-2">
                    <div className="font-semibold">Supplier Item {index + 1}</div>
                    <button className="px-2 h-8 btn" disabled={lines.length === 1} onClick={() => setLines(lines.filter((item) => item.id !== line.id))} type="button">
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className="gap-3 grid md:grid-cols-[2fr_75px_75px_75px_75px]">
                    <MedicineSelect medicines={medicines} value={line.medicineId} onChange={(value) => selectMedicine(line.id, value)} />
                    <NumberField label="Qty" value={line.qtyOrdered} onChange={(value) => updateLine(line.id, { qtyOrdered: value })} />
                    <NumberField label="Committed Price" value={line.committedUnitPrice} readOnly/>
                    <NumberField label="Discount" value={line.discountAmount} onChange={(value) => updateLine(line.id, { discountAmount: value })} step="0.01" />
                    <NumberField label="Line Total" value={linetotal} readOnly/>
                  </div>
                </div>
              )
            }
            )}
          </div>

          <div className="flex md:flex-row flex-col md:justify-between gap-3 mt-4">
            <button className="btn" onClick={() => setLines([...lines, newSupplierLine()])} type="button">
              <Plus size={18} />
              Add Item
            </button>
            <button className="btn btn-primary" type="submit">
              <Save size={18} />
              Save Supplier Order
            </button>
          </div>
        </form>
      </div>

      {message && <InlineAlert tone="ok" text={message} />}
      {error && <InlineAlert tone="error" text={error} />}
      <SupplierOrderTable orders={supplierOrders} onChanged={onChanged} />
    </section>
  );
}

function SupplierOrderTable({ orders, onChanged }) {
  const [error, setError] = useState("");

  const updateStatus = async (orderId, status) => {
    setError("");
    try {
      await api(`/supplier-orders/${orderId}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
      await onChanged();
    } catch (apiError) {
      setError((apiError.errors || [apiError.message || "Status update failed."]).join(" "));
    }
  };

  const receiveAll = async (orderId) => {
    setError("");
    try {
      await api(`/supplier-orders/${orderId}/receive`, { method: "POST", body: JSON.stringify({}) });
      await onChanged();
    } catch (apiError) {
      setError((apiError.errors || [apiError.message || "Receive failed."]).join(" "));
    }
  };

  return (
    <div className="overflow-hidden panel">
      <div className="px-4 py-3 border-stone-200 border-b">
        <h2 className="font-bold text-stone-950 text-lg">Supplier Order Status</h2>
      </div>
      {error && <InlineAlert tone="error" text={error} />}
      <div className="max-h-[255px] overflow-auto">
        <table className="w-full min-w-[1020px] border-collapse">
          <thead className="table-head">
            <tr>
              <th className="px-3 py-2">Supplier</th>
              <th className="px-3 py-2">Call</th>
              <th className="px-3 py-2">Deadline</th>
              <th className="px-3 py-2">Qty</th>
              <th className="px-3 py-2">Value</th>
              <th className="px-3 py-2">Reliability</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => {
              const qtyOrdered = order.items.reduce((total, item) => total + Number(item.qtyOrdered || 0), 0);
              const qtyReceived = order.items.reduce((total, item) => total + Number(item.qtyReceived || 0), 0);
              return (
                <tr className="bg-white" key={order.id}>
                  <td className="table-cell">{order.supplierName}</td>
                  <td className="table-cell"><CallIcon phone={order.followUpPhone || order.supplierPhone} /></td>
                  <td className="table-cell">{order.expectedDeliveryDate}</td>
                  <td className="table-cell">{qtyReceived}/{qtyOrdered}</td>
                  <td className="table-cell">Rs {money(order.totalCommittedValue)}</td>
                  <td className="table-cell">{order.reliabilitySnapshot}/5</td>
                  <td className="table-cell">
                    <select className="min-w-44 h-9 field" value={order.status} onChange={(event) => updateStatus(order.id, event.target.value)}>
                      {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
                    </select>
                  </td>
                  <td className="table-cell">
                    <div className="flex gap-2">
                      <button className="h-9 btn" onClick={() => receiveAll(order.id)} type="button" disabled={order.status === "received" || order.status === "cancelled"}>
                        <Package size={16} />
                        Receive
                      </button>
                      <button className="h-9 btn" onClick={() => window.open(apiUrl(order.invoiceUrl), "_blank", "noopener")} type="button">
                        <Printer size={16} />
                        PDF
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {orders.length === 0 && (
              <tr>
                <td className="table-cell text-stone-600" colSpan="8">No supplier orders yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MedicinesPage({ medicines, inventory, onChanged }) {
  const [form, setForm] = useState(emptyMedicineForm());
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const saveMedicine = async (event) => {
    event.preventDefault();
    setMessage("");
    setError("");
    try {
      if (editingId) {
        await api(`/medicines/${editingId}`, { method: "PUT", body: JSON.stringify(form) });
        await api(`/inventory/${editingId}/correction`, {
          method: "POST",
          body: JSON.stringify({
            currentUnits: form.currentUnits,
            replenishmentLevel: form.replenishmentLevel,
            refillBufferUnits: form.refillBufferUnits,
          }),
        });
        setMessage("Medicine updated.");
      } else {
        await api("/medicines", { method: "POST", body: JSON.stringify(form) });
        setMessage("Medicine created.");
      }
      setForm(emptyMedicineForm());
      setEditingId(null);
      await onChanged();
    } catch (apiError) {
      setError((apiError.errors || [apiError.message || "Medicine save failed."]).join(" "));
    }
  };

  const editMedicine = (medicine) => {
    setEditingId(medicine.id);
    setForm({
      skuCode: medicine.skuCode,
      skuName: medicine.skuName,
      medicineName: medicine.medicineName,
      category: medicine.category,
      brand: medicine.brand,
      form: medicine.form,
      strength: medicine.strength,
      packSize: medicine.packSize,
      costPrice: medicine.costPrice,
      sellingPrice: medicine.sellingPrice,
      currentUnits: String(medicine.currentUnits ?? 0),
      replenishmentLevel: String(medicine.replenishmentLevel ?? 0),
      refillBufferUnits: String(medicine.refillBufferUnits ?? 0),
    });
    setMessage("");
    setError("");
  };

  const archiveMedicine = async (medicineId) => {
    if (!window.confirm("Archive this medicine? It will be hidden from new orders but kept in history.")) {
      return;
    }
    setMessage("");
    setError("");
    try {
      await api(`/medicines/${medicineId}`, { method: "DELETE" });
      setMessage("Medicine archived.");
      await onChanged();
    } catch (apiError) {
      setError((apiError.errors || [apiError.message || "Archive failed."]).join(" "));
    }
  };

  return (
    <section className="gap-4 grid lg:grid-cols-[430px_1fr]">
      <form className="p-4 panel" onSubmit={saveMedicine}>
        <div className="flex justify-between items-start gap-3 mb-4">
          <div>
            <h1 className="font-bold text-stone-950 text-xl">Medicines</h1>
            <p className="text-stone-600 text-sm">Create, update, or archive medicines and stock thresholds.</p>
          </div>
          {editingId && (
            <button className="h-9 btn" onClick={() => { setEditingId(null); setForm(emptyMedicineForm()); }} type="button">
              <X size={16} />
              Clear
            </button>
          )}
        </div>
        <div className="gap-3 grid md:grid-cols-2">
          <TextField label="SKU Code" value={form.skuCode} onChange={(value) => setForm({ ...form, skuCode: value })} />
          <TextField label="SKU Name" value={form.skuName} onChange={(value) => setForm({ ...form, skuName: value })} />
          <TextField label="Medicine Name" value={form.medicineName} onChange={(value) => setForm({ ...form, medicineName: value })} />
          <TextField label="Brand" value={form.brand} onChange={(value) => setForm({ ...form, brand: value })} />
          <TextField label="Category" value={form.category} onChange={(value) => setForm({ ...form, category: value })} />
          <TextField label="Form" value={form.form} onChange={(value) => setForm({ ...form, form: value })} />
          <TextField label="Strength" value={form.strength} onChange={(value) => setForm({ ...form, strength: value })} />
          <TextField label="Pack Size" value={form.packSize} onChange={(value) => setForm({ ...form, packSize: value })} />
          <NumberField label="Cost Price" value={form.costPrice} onChange={(value) => setForm({ ...form, costPrice: value })} step="0.01" />
          <NumberField label="Selling Price" value={form.sellingPrice} onChange={(value) => setForm({ ...form, sellingPrice: value })} step="0.01" />
          <NumberField label="Current Units" value={form.currentUnits} onChange={(value) => setForm({ ...form, currentUnits: value })} />
          <NumberField label="Replenishment Level" value={form.replenishmentLevel} onChange={(value) => setForm({ ...form, replenishmentLevel: value })} />
          <NumberField label="Refill Buffer" value={form.refillBufferUnits} onChange={(value) => setForm({ ...form, refillBufferUnits: value })} />
        </div>
        <button className="mt-4 w-full btn btn-primary" type="submit">
          <Save size={18} />
          {editingId ? "Update Medicine" : "Create Medicine"}
        </button>
        {message && <InlineAlert tone="ok" text={message} />}
        {error && <InlineAlert tone="error" text={error} />}
      </form>

      <div className="overflow-hidden panel">
        <div className="px-4 py-3 border-stone-200 border-b">
          <h2 className="font-bold text-stone-950 text-lg">Medicine Stock</h2>
        </div>
        <div className="max-h-[255px] overflow-auto">
          <table className="w-100 min-w-[880px] border-collapse">
            <thead className="table-head">
              <tr>
                <th className="px-3 py-2">Medicine</th>
                <th className="px-3 py-2">Brand</th>
                <th className="px-3 py-2">Units</th>
                <th className="px-3 py-2">Level</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Price</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {medicines.map((medicine) => {
                const stock = inventory.find((row) => row.medicineId === medicine.id);
                return (
                  <tr className="bg-white" key={medicine.id}>
                    <td className="table-cell">{medicine.medicineName}</td>
                    <td className="table-cell">{medicine.brand}</td>
                    <td className="table-cell">{stock?.currentUnits ?? medicine.currentUnits ?? 0}</td>
                    <td className="table-cell">{stock?.replenishmentLevel ?? medicine.replenishmentLevel ?? 0}</td>
                    <td className="table-cell">{stock?.status || "OK"}</td>
                    <td className="table-cell">Rs {money(medicine.sellingPrice)}</td>
                    <td className="table-cell">
                      <div className="flex gap-2">
                        <button className="h-6 btn" onClick={() => editMedicine(medicine)} type="button">
                          <Save size={16} />
                        </button>
                        <button className="h-6 btn btn-danger" onClick={() => archiveMedicine(medicine.id)} type="button">
                          <Archive size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {medicines.length === 0 && (
                <tr>
                  <td className="table-cell text-stone-600" colSpan="7">No active medicines yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
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

function TextField({ label, value, onChange }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input className="field" value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function DateField({ label, value, onChange }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input className="field" type="date" value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function NumberField({ label, value, onChange, step = "1" }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input
        className="field"
        inputMode="decimal"
        onChange={(event) => onChange(event.target.value)}
        step={step}
        type="number"
        value={value}
      />
    </div>
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

function InlineAlert({ tone, text }) {
  const classes =
    tone === "error"
      ? "border-red-300 bg-red-50 text-red-800"
      : tone === "warn"
        ? "border-amber-300 bg-amber-50 text-amber-900"
        : "border-emerald-300 bg-emerald-50 text-emerald-900";
  return (
    <div className={`mt-3 flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${classes}`}>
      {tone === "error" || tone === "warn" ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
      {text}
    </div>
  );
}
