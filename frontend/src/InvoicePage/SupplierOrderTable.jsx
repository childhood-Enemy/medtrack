import inlineAlert from "../commons/Fields/Fields.jsx";
import { Package, Printer, PhoneCall } from "lucide-react";
import { money, uid } from "../utils.js";
import { api, apiUrl } from "../api.js";
import { STATUS_OPTIONS } from "../../constants.js";
import { useState } from "react";

const SupplierOrderTable = ({ orders, onChanged }) => {
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

export default SupplierOrderTable;