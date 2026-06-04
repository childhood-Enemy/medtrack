import { get, set, filter, map } from "lodash";
import { useState, useEffect } from "react";
import { emptyMedicineForm, MEDICINE_FIELDS } from "../../../constants";
import { NumberField, TextField } from "../../commons/Fields/Fields";
import { InlineAlert } from "../../commons/Fields/Fields";
import { Save, Archive, X } from "lucide-react";

// Editing Id : Medicine ID selected on edit action button
// SetEditingId: 
const MedicineModal = (
    {
        editingId = null,
        setShowMedicineModal = () => { },
        setEditingId = () => { },
        onSave = () => { },
        onClear = () => { },
        setForm = () => { },
        medicineData = {}
    }
) => {
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");

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
    return (
        <div className="z-50 fixed inset-0 flex justify-center items-center bg-black/50 p-4">
            <div className="bg-white shadow-2xl rounded-xl w-full max-w-5xl max-h-[90vh] overflow-y-auto">

                {/* Header */}
                <div className="flex justify-between items-center px-6 py-4 border-b">
                    <div>
                        <h1 className="font-bold text-stone-950 text-2xl">
                            {editingId ? "Edit Medicine" : "New Medicine"}
                        </h1>
                        <p className="text-stone-600 text-sm">
                            Create, update, or archive medicines and stock thresholds.
                        </p>
                    </div>

                    <button
                        type="button"
                        className="flex justify-center items-center hover:bg-stone-100 rounded-lg w-10 h-10"
                        onClick={() => {
                            setShowMedicineModal(false);
                            setEditingId(null);
                            setForm(emptyMedicineForm);
                        }}
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Form */}
                <form
                    className="p-6"
                    onSubmit={saveMedicine}
                >
                    <div className="gap-4 grid md:grid-cols-2 lg:grid-cols-3">
                        {MEDICINE_FIELDS.map((field) => {
                            const Component =
                                field.type === "number"
                                    ? NumberField
                                    : TextField;

                            return (
                                <Component
                                    key={field.key}
                                    label={field.label}
                                    value={medicineData[field.key]}
                                    // step={field.step}
                                    onChange={(value) =>
                                        setForm({
                                            ...medicineData,
                                            [field.key]: value,
                                        })
                                    }
                                />
                            );
                        })}
                    </div>

                    {(message || error) && (
                        <div className="space-y-2 mt-4">
                            {message && (
                                <InlineAlert
                                    tone="ok"
                                    text={message}
                                />
                            )}
                            {error && (
                                <InlineAlert
                                    tone="error"
                                    text={error}
                                />
                            )}
                        </div>
                    )}

                    <div className="flex justify-end gap-3 mt-6 pt-4 border-t">

                        <button
                            type="button"
                            className="btn"
                            onClick={() => {
                                setShowMedicineModal(false);
                                setEditingId(null);
                                setForm(emptyMedicineForm);
                            }}
                        >
                            Cancel
                        </button>

                        <button
                            className="btn btn-primary"
                            type="submit"
                        >
                            <Save size={18} />
                            {editingId
                                ? "Update Medicine"
                                : "Create Medicine"}
                        </button>

                    </div>
                </form>
            </div>
        </div>
    )
}
export default MedicineModal;