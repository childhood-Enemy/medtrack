import { useState, useEffect } from "react";
import { get, map } from "lodash";
import { AlertTriangle } from "lucide-react";
import { ROUTES, PILL_OPTIONS } from "../../constants.js";
import { api } from "../api.js";
import PendingSupplierPanel from "./PendingSupplierPanel.jsx";
import PillButton from "../PillButton/PillButton.jsx";
import InventoryAlertTable from "../InventoryAlertTable/InventoryAlertTable.jsx";

const HomePage = ({ summary, loading, setBulkOrderInvoice = () => { }, bulkOrderInvoice = null }) => {
    const [activeTab, setActiveTab] = useState("low-supply");

    const bulkOrderClick = (medsToOrder) => {
        const invoiceLines = map(medsToOrder, (medicine) => {
            const { medicineId, unitsToReorder, costPrice } = medicine;
            // Order - 1 : Easier : We will reiterate and add unit price once we are on the invoice page.
            return ({
                id: crypto.randomUUID(),
                medicineId: medicineId,
                qtyOrdered: unitsToReorder,
                discountAmount: "0"
            })
        });
        setBulkOrderInvoice(invoiceLines);
    };

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
                            bulkOrderClick={bulkOrderClick}
                        />);
                })}
            </div>
        </section>
    );
}

export default HomePage;