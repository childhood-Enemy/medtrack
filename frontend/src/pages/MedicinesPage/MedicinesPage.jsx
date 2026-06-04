import { map, get, set, filter, find } from "lodash";
import { useEffect, useState } from "react";
import { emptyMedicineForm } from "../../../constants";
import { TextField, DateField, NumberField } from "../../commons/Fields/Fields";
import { Save, Archive, X } from "lucide-react";
import { money } from "../../utils";
import MedicineModal from "./MedicineModal";
import { InlineAlert } from "../../commons/Fields/Fields";

const MedicinesPage = ({ medicines, inventory, onChanged }) => {
    const [medicineData, setMedicineData] = useState(emptyMedicineForm);
    const [editingId, setEditingId] = useState(null);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");

    // Medicine Modal
    const [showMedicineModal, setShowMedicineModal] = useState(false);

    useEffect(() => {
        !showMedicineModal && setMedicineData(emptyMedicineForm);
    }, [showMedicineModal])

    const saveMedicine = async (event) => {
        event.preventDefault();
        setMessage("");
        setError("");
        try {
            if (editingId) {
                await api(`/medicines/${editingId}`, { method: "PUT", body: JSON.stringify(medicineData) });
                await api(`/inventory/${editingId}/correction`, {
                    method: "POST",
                    body: JSON.stringify({
                        currentUnits: medicineData.currentUnits,
                        replenishmentLevel: medicineData.replenishmentLevel,
                        refillBufferUnits: medicineData.refillBufferUnits,
                    }),
                });
                setMessage("Medicine updated.");
            } else {
                await api("/medicines", { method: "POST", body: JSON.stringify(medicineData) });
                setMessage("Medicine created.");
            }
            setMedicineData(emptyMedicineForm);
            setEditingId(null);
            await onChanged();
        } catch (apiError) {
            setError((apiError.errors || [apiError.message || "Medicine save failed."]).join(" "));
        }
    };

    const editMedicine = (medicine) => {
        setEditingId(medicine.id);
        setMedicineData({
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
        setShowMedicineModal(true);
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
        <section className="gap-4">
            {
                showMedicineModal && <MedicineModal
                    medicineId={editingId}
                    setShowMedicineModal={setShowMedicineModal}
                    setMedicineData={setMedicineData}
                    editingId={editingId}
                    setEditingId={setEditingId}
                    medicineData={medicineData}
                />
            }

            <div className="overflow-hidden panel">
                <div className="px-4 py-3 border-stone-200 border-b">
                    <h2 className="font-bold text-stone-950 text-lg">Medicine Stock</h2>
                    <button
                        className="btn"
                        onClick={() => { setShowMedicineModal(true) }}
                    >
                        + New Medicine
                    </button>
                    {/* Add filter for order now /  */}
                </div>
                <div className="max-h-[60vh] overflow-auto">
                    <table className="min-w-[880px] border-collapse">
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
                                let status = "Ok";
                                if (stock.status === "REFILL_SOON") {
                                    status = "Refill Soon"
                                } else if (stock.status === "LOW_STOCK") {
                                    status = "Low Stock";
                                }
                                const statusColor = stock?.status === "REFILL_SOON" ? "bg-amber-50" : stock?.status === "LOW_STOCK" ? "bg-red-50" : "bg-green-50";

                                return (
                                    <tr className={statusColor} key={medicine.id}>
                                        <td className="table-cell">{medicine.skuName}</td>
                                        <td className="table-cell">{medicine.brand}</td>
                                        <td className="table-cell">{stock?.currentUnits ?? medicine.currentUnits ?? 0}</td>
                                        <td className="table-cell">{stock?.replenishmentLevel ?? medicine.replenishmentLevel ?? 0}</td>
                                        <td className="table-cell">{status}</td>
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

export default MedicinesPage;