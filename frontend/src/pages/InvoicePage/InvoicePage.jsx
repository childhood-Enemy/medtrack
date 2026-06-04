import { useState, useMemo, useEffect } from "react";
import { Save, Plus, Trash2 } from "lucide-react";
import { api, apiUrl } from "../../api.js";
import { todayInputDate, newSupplierLine } from "../../utils.js"
// import fieldFunctions from "../commons/Fields/Fields.jsx";
import { TextField, NumberField, DateField, InlineAlert } from "../../commons/Fields/Fields.jsx";
import MedicineSelect from "../../commons/MedicineSelect/MedicineSelect.jsx";
import SupplierOrderTable from "./SupplierOrderTable.jsx";
import { STATUS_OPTIONS } from "../../../constants.js";
import { get } from "lodash";

import { map } from "lodash";

const InvoicePage = ({ medicines, suppliers, supplierOrders, onChanged, bulkOrderInvoice = null }) => {
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

    useEffect(() => {
        if (bulkOrderInvoice != null) {
            let updatedList = [];
            map(bulkOrderInvoice, (invoice) => { 
                const {medicineId} = invoice;
                const medDetails = medicineById.get(String(medicineId));
                invoice = {
                    ...invoice,
                    committedUnitPrice: get(medDetails,"costPrice","")
                }
                updatedList.push(invoice);
            });
            setLines(updatedList);
        }
    }, [bulkOrderInvoice])

    //Save Supplier
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
        // Adds new line item medicines to the list
        setLines((current) => current.map((line) => (line.id === lineId ? { ...line, ...patch } : line)));
    };

    const selectMedicine = (lineId, medicineId) => {
        const medicine = medicineById.get(String(medicineId));
        updateLine(lineId, { medicineId, committedUnitPrice: get(medicine, "costPrice", "") });
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
                                        <NumberField label="Unit Price" value={line.committedUnitPrice} onChange={(value) => updateLine(line.id, { committedUnitPrice: value })} />
                                        <NumberField label="Discount" value={line.discountAmount} onChange={(value) => updateLine(line.id, { discountAmount: value })} step="0.01" />
                                        <TextField label="Line Total" value={linetotal} readOnly />
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

function emptySupplierForm() {
    return { supplierName: "", phone: "", contactPerson: "", reliabilityRating: "3" };
}

export default InvoicePage;