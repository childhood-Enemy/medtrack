import { useState, useEffect } from "react";
import { filter, find, get } from "lodash";
const MedicineSelect = ({ medicines, value, onChange }) => {
    const [search, setSearch] = useState("");
    const [isOpen, setIsOpen] = useState(false);

    const filtered = medicines.filter(
        (medicine) =>
            medicine.skuName
                .toLowerCase()
                .includes(search.toLowerCase())
    );

    useEffect(() => {
        if (search.length != 0) {
            const bval = search.length > 0
            setIsOpen(bval);
        }
    }, [search]);

    useEffect(() => {
        if (value != null) {
            let preselectedMedicine = find(medicines,
                (medicine) => medicine.id === value)
            console.log(medicines, preselectedMedicine);
            setSearch(get(preselectedMedicine, "skuName", ""));
        }
        const close = () => setIsOpen(false);
        document.addEventListener("click", close);
        return () =>
            document.removeEventListener("click", close);
    }, []);

    return (
        <div className="relative">
            <label className="label">Medicine</label>

            <input
                className="field"
                placeholder="Search medicine..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
            />

            {search && (
                <div className="z-50 absolute bg-white shadow-lg border rounded-md w-full max-h-60 overflow-auto">
                    {isOpen && filtered.map((medicine) => (
                        <button
                            key={medicine.id}
                            type="button"
                            className="block hover:bg-gray-100 px-3 py-2 w-full text-left"
                            onClick={() => {
                                setSearch(medicine.skuName);
                                onChange(medicine.id);
                                setIsOpen(false);
                            }}
                        >
                            {medicine.skuName}
                            <span className="ml-2 text-gray-500">
                                ({medicine.currentUnits ?? 0} units)
                            </span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

export default MedicineSelect;