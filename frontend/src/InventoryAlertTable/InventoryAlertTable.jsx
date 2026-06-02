import { map, get, orderBy } from "lodash";
const InventoryAlertTable = ({ title, icon: Icon, rows, bg }) => {
    const headers = [
        {
            label: "Medicine",
            key: "medicineName"
        }, {
            label: "Units",
            key: "currentUnits"
        }, {
            label: "Level",
            key: "replenishmentLevel"
        }, {
            label: "Buffer",
            key: "refillBufferUnits"
        }, {
            label: "Reorder Qty",
            key: "unitsToReorder",
        }
    ];
    const rowsWithReorderQty = map(rows, (row) => (
        {
            ...row,
            unitsToReorder:
                row.replenishmentLevel +
                row.refillBufferUnits -
                row.currentUnits
        }
    ));

    const sortedRows = orderBy(
        rowsWithReorderQty,
        ["unitsToReorder"],
        ["desc"]
    );
    return (
        <div className="overflow-hidden panel">
            <div className={`flex items-center gap-2 px-4 py-3 border-stone-200 border-b ${bg}`}>
                <Icon size={20} />
                <h2 className="font-bold text-stone-950 text-lg">{title}</h2>
            </div>
            <div className="max-h-[255px] overflow-auto">
                <table className="w-full min-w-[430px] border-collapse">
                    <thead className="table-head top-0 z-10 sticky bg-gray-50">
                        <tr>
                            {map(headers, (header) => (
                                <th className="px-3 py-2" key={header.key}>
                                    {header.label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {map(sortedRows, (row) => {
                            const { medicineId, unitsToReorder } = row;
                            return unitsToReorder != 0 && (
                                <tr className="bg-white" key={medicineId}>
                                    {map(headers, (header) => (
                                        <td className="table-cell">
                                            {get(row, header.key, "")}
                                        </td>
                                    ))}
                                </tr>
                            );
                        }
                        )}
                        {rows.length === 0 && (
                            <tr>
                                <td className="table-cell text-stone-600" colSpan="4">No medicines in this category.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div >
    );
}

export default InventoryAlertTable;