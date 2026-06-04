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
import { money } from "../../utils.js";
import { STATUS_OPTIONS } from "../../../constants.js";

const PendingSupplierPanel = ({ orders, total, page, pageSize }) => {
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

export const CallIcon = ({ phone }) => {
  if (!phone) {
    return <span className="text-stone-500">-</span>;
  }

  return (
    <span className="inline-flex justify-center items-center bg-white border border-stone-300 rounded-md w-8 h-8 text-stone-800" title={phone}>
      <PhoneCall size={17} />
    </span>
  );
}

export default PendingSupplierPanel;