from __future__ import annotations

import re
import sys
from datetime import date, timedelta
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from sqlite_store import SQLiteStore, today_iso  # noqa: E402


MEDICINE_NAMES = [
    "Paracetamol",
    "Amoxicillin",
    "Azithromycin",
    "Cetirizine",
    "Metformin",
    "Amlodipine",
    "Atorvastatin",
    "Pantoprazole",
    "Omeprazole",
    "Ibuprofen",
    "Diclofenac",
    "Doxycycline",
    "Losartan",
    "Telmisartan",
    "Montelukast",
    "Levocetirizine",
    "Cefixime",
    "Ciprofloxacin",
    "Domperidone",
    "Ondansetron",
    "Rabeprazole",
    "Clopidogrel",
    "Aspirin",
    "Insulin Glargine",
    "Salbutamol",
]

BRANDS = [
    "Cipla",
    "Sun Pharma",
    "Dr Reddy",
    "Lupin",
    "Alkem",
    "Torrent",
    "Zydus",
    "Glenmark",
    "Mankind",
    "Abbott",
]

CATEGORIES = [
    "Analgesic",
    "Antibiotic",
    "Antihistamine",
    "Diabetes Care",
    "Cardiac",
    "Gastro",
    "Respiratory",
]

FORMS = ["Tablet", "Capsule", "Syrup", "Injection", "Inhaler", "Gel"]
STRENGTHS = ["100mg", "250mg", "500mg", "650mg", "10mg", "20mg", "40mg", "5ml"]
PACK_SIZES = ["10 tablets", "15 tablets", "30 tablets", "60ml", "100ml", "1 vial", "1 inhaler"]


def next_numeric_suffix(existing_values: list[str], pattern: str) -> int:
    regex = re.compile(pattern)
    highest = 0
    for value in existing_values:
        match = regex.fullmatch(value)
        if match:
            highest = max(highest, int(match.group(1)))
    return highest + 1


def demo_dates() -> list[str]:
    today = date.fromisoformat(today_iso())
    year = today.year
    candidates = [
        today,
        date(year, 1, 16),
        date(year, 2, 12),
        date(year, 3, 18),
        date(year, 4, 22),
    ]
    return [min(candidate, today).isoformat() for candidate in candidates]


def medicine_payload(sequence: int, profile_index: int) -> dict[str, Any]:
    name = MEDICINE_NAMES[profile_index % len(MEDICINE_NAMES)]
    brand = BRANDS[profile_index % len(BRANDS)]
    category = CATEGORIES[profile_index % len(CATEGORIES)]
    form = FORMS[profile_index % len(FORMS)]
    strength = STRENGTHS[profile_index % len(STRENGTHS)]
    pack_size = PACK_SIZES[profile_index % len(PACK_SIZES)]
    cost_price = 18 + (profile_index % 17) * 3.25
    selling_price = cost_price * 1.28

    if profile_index < 20:
        replenishment = 24 + (profile_index % 6)
        refill_buffer = 10 + (profile_index % 4)
        current = max(0, replenishment - (profile_index % 5))
    elif profile_index < 45:
        replenishment = 22 + (profile_index % 7)
        refill_buffer = 12 + (profile_index % 5)
        current = replenishment + 1 + (profile_index % refill_buffer)
    else:
        replenishment = 18 + (profile_index % 8)
        refill_buffer = 10 + (profile_index % 6)
        current = replenishment + refill_buffer + 35 + (profile_index % 45)

    sku_code = f"DEMO-MED-{sequence:03d}"
    return {
        "skuCode": sku_code,
        "skuName": f"{name} {strength} {form} Demo {sequence:03d}",
        "medicineName": name,
        "category": category,
        "brand": brand,
        "form": form,
        "strength": strength,
        "packSize": pack_size,
        "costPrice": f"{cost_price:.2f}",
        "sellingPrice": f"{selling_price:.2f}",
        "currentUnits": str(current),
        "replenishmentLevel": str(replenishment),
        "refillBufferUnits": str(refill_buffer),
    }


def seed_medicines(store: SQLiteStore) -> list[dict[str, Any]]:
    existing_codes = [medicine["skuCode"] for medicine in store.list_medicines(include_archived=True)]
    next_sequence = next_numeric_suffix(existing_codes, r"DEMO-MED-(\d+)")
    created: list[dict[str, Any]] = []
    for offset in range(100):
        created.append(store.create_medicine(medicine_payload(next_sequence + offset, offset)))
    return created


def seed_suppliers(store: SQLiteStore) -> list[dict[str, Any]]:
    existing_names = [supplier["supplierName"] for supplier in store.list_suppliers(include_archived=True)]
    next_sequence = next_numeric_suffix(existing_names, r"Demo Supplier (\d+)")
    suppliers = []
    for offset in range(5):
        number = next_sequence + offset
        suppliers.append(
            store.create_supplier(
                {
                    "supplierName": f"Demo Supplier {number:03d}",
                    "phone": f"98765{number:05d}"[-10:],
                    "contactPerson": f"Demo Contact {number:03d}",
                    "reliabilityRating": str(3 + (offset % 3)),
                }
            )
        )
    return suppliers


def seed_supplier_orders(store: SQLiteStore, medicines: list[dict[str, Any]], suppliers: list[dict[str, Any]]) -> list[dict[str, Any]]:
    statuses = ["sent", "awaiting confirmation", "confirmed", "partially received", "received"]
    today = date.fromisoformat(today_iso())
    created: list[dict[str, Any]] = []
    source_medicines = medicines[45:]
    for index, status in enumerate(statuses):
        items = []
        for item_offset in range(3):
            medicine = source_medicines[(index * 5 + item_offset) % len(source_medicines)]
            qty = 18 + index * 4 + item_offset * 3
            unit_price = float(medicine["costPrice"]) * (0.91 + item_offset * 0.02)
            items.append(
                {
                    "medicineId": medicine["id"],
                    "qtyOrdered": str(qty),
                    "committedUnitPrice": f"{unit_price:.2f}",
                    "discountAmount": f"{item_offset * 4:.2f}",
                }
            )
        order = store.create_supplier_order(
            {
                "supplierId": suppliers[index]["id"],
                "orderDate": (today - timedelta(days=12 - index * 2)).isoformat(),
                "expectedDeliveryDate": (today + timedelta(days=index - 1)).isoformat(),
                "status": "confirmed" if status in {"partially received", "received"} else status,
                "discountAmount": f"{10 + index * 3:.2f}",
                "notes": "Demo seed data supplier invoice",
                "items": items,
            }
        )
        if status == "partially received":
            receive_items = [
                {"itemId": item["id"], "qtyReceived": max(1, int(item["qtyOrdered"]) // 2)}
                for item in order["items"]
            ]
            order = store.receive_supplier_order(order["id"], {"items": receive_items})
        elif status == "received":
            order = store.receive_supplier_order(order["id"], {})
        store.supplier_invoice_pdf(order["id"])
        created.append(order)
    return created


def seed_sales_orders(store: SQLiteStore, medicines: list[dict[str, Any]]) -> list[dict[str, Any]]:
    created: list[dict[str, Any]] = []
    sale_dates = demo_dates()
    source_medicines = medicines[60:]
    for order_index, order_date in enumerate(sale_dates):
        line_count = 2 + (order_index % 4)
        items = []
        used_ids: set[int] = set()
        for line_index in range(line_count):
            medicine = source_medicines[(order_index * 7 + line_index) % len(source_medicines)]
            if medicine["id"] in used_ids:
                continue
            used_ids.add(medicine["id"])
            qty = 1 + ((order_index + line_index) % 4)
            discount = 0 if line_index == 0 else 2 + line_index
            items.append(
                {
                    "medicineId": medicine["id"],
                    "qtySold": str(qty),
                    "unitPrice": medicine["sellingPrice"],
                    "discountAmount": f"{discount:.2f}",
                }
            )
        order = store.create_sales_order(
            {
                "orderDate": order_date,
                "customerName": f"Demo Customer {order_index + 1:03d}",
                "customerPhone": f"91234{order_index + 1:05d}"[-10:],
                "discountAmount": f"{order_index * 3:.2f}",
                "items": items,
            }
        )
        store.sales_receipt_pdf(order["id"])
        created.append(order)
    return created


def seed_demo_data(store: SQLiteStore | None = None) -> dict[str, Any]:
    store = store or SQLiteStore()
    medicines = seed_medicines(store)
    suppliers = seed_suppliers(store)
    supplier_orders = seed_supplier_orders(store, medicines, suppliers)
    sales_orders = seed_sales_orders(store, medicines)
    summary = store.home_summary(page_size=10)
    return {
        "medicinesCreated": len(medicines),
        "suppliersCreated": len(suppliers),
        "supplierOrdersCreated": len(supplier_orders),
        "salesOrdersCreated": len(sales_orders),
        "pdfsCreated": len(supplier_orders) + len(sales_orders),
        "lowStockCount": len(summary["lowStockMedicines"]),
        "refillSoonCount": len(summary["refillSoonMedicines"]),
        "todaySalesValue": summary["todaySalesValue"],
        "ytdSalesValue": summary["ytdSalesValue"],
    }


def main() -> None:
    result = seed_demo_data()
    print("MEDTRACK demo data seeded.")
    for key, value in result.items():
        print(f"{key}: {value}")


if __name__ == "__main__":
    main()
