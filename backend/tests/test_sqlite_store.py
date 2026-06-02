from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlite_store import SQLiteStore, ValidationError, today_iso  # noqa: E402


class SQLiteStoreTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.store = SQLiteStore(Path(self.temp_dir.name) / "medtrack.sqlite3")

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def create_medicine(self, sku: str = "SKU001", name: str = "Crocin") -> dict:
        return self.store.create_medicine(
            {
                "skuCode": sku,
                "skuName": f"{name} Strip",
                "medicineName": name,
                "category": "Analgesic",
                "brand": "GSK",
                "form": "Tablet",
                "strength": "500mg",
                "packSize": "10",
                "costPrice": "10.00",
                "sellingPrice": "12.50",
                "currentUnits": "20",
                "replenishmentLevel": "5",
                "refillBufferUnits": "5",
            }
        )

    def create_supplier(self) -> dict:
        return self.store.create_supplier(
            {
                "supplierName": "Health Distributor",
                "phone": "9999999999",
                "contactPerson": "Amit",
                "reliabilityRating": "4",
            }
        )

    def test_medicine_crud_archives_and_rejects_duplicates(self) -> None:
        medicine = self.create_medicine()
        self.assertEqual(medicine["currentUnits"], 20)

        with self.assertRaises(ValidationError) as context:
            self.create_medicine("SKU001", "Dolo")
        self.assertEqual(context.exception.code, "DUPLICATE_MEDICINE")

        updated = self.store.update_medicine(medicine["id"], {"sellingPrice": "14.00", "replenishmentLevel": "6"})
        self.assertEqual(updated["sellingPrice"], "14.00")
        self.assertEqual(updated["replenishmentLevel"], 6)

        archived = self.store.archive_medicine(medicine["id"])
        self.assertFalse(archived["isActive"])
        self.assertEqual(self.store.list_medicines(), [])
        self.assertEqual(len(self.store.list_medicines(include_archived=True)), 1)

    def test_sales_order_decrements_inventory_and_generates_pdf(self) -> None:
        med1 = self.create_medicine()
        med2 = self.create_medicine("SKU002", "Dolo")

        order = self.store.create_sales_order(
            {
                "orderDate": "2026-06-01",
                "customerName": "Walk-in",
                "items": [
                    {"medicineId": med1["id"], "qtySold": "2", "unitPrice": "12.50"},
                    {"medicineId": med2["id"], "qtySold": "3", "unitPrice": "12.50"},
                ],
            }
        )

        self.assertEqual(order["orderNo"], "SO0001")
        self.assertEqual(order["totalAmount"], "62.50")
        inventory = {row["medicineId"]: row for row in self.store.list_inventory()}
        self.assertEqual(inventory[med1["id"]]["currentUnits"], 18)
        self.assertEqual(inventory[med2["id"]]["currentUnits"], 17)

        filename, pdf = self.store.sales_receipt_pdf(order["id"])
        self.assertEqual(filename, "SO0001_receipt.pdf")
        self.assertTrue(pdf.startswith(b"%PDF-1.4"))

    def test_sales_order_blocks_negative_inventory(self) -> None:
        medicine = self.create_medicine()
        with self.assertRaises(ValidationError) as context:
            self.store.create_sales_order(
                {
                    "orderDate": "2026-06-01",
                    "items": [{"medicineId": medicine["id"], "qtySold": "21"}],
                }
            )
        self.assertEqual(context.exception.code, "INSUFFICIENT_INVENTORY")
        self.assertEqual(self.store.list_inventory()[0]["currentUnits"], 20)

    def test_supplier_order_and_receiving_increment_inventory(self) -> None:
        medicine = self.create_medicine()
        supplier = self.create_supplier()

        supplier_order = self.store.create_supplier_order(
            {
                "supplierId": supplier["id"],
                "orderDate": "2026-06-01",
                "expectedDeliveryDate": "2026-06-05",
                "status": "awaiting_confirmation",
                "discountAmount": "5.00",
                "items": [
                    {
                        "medicineId": medicine["id"],
                        "qtyOrdered": "10",
                        "committedUnitPrice": "8.00",
                        "discountAmount": "0",
                    }
                ],
            }
        )

        self.assertEqual(supplier_order["poNo"], "PO0001")
        self.assertEqual(supplier_order["totalCommittedValue"], "75.00")
        self.assertEqual(supplier_order["reliabilitySnapshot"], 4)

        received = self.store.receive_supplier_order(supplier_order["id"], {})
        self.assertEqual(received["status"], "received")
        self.assertEqual(received["items"][0]["qtyReceived"], 10)
        self.assertEqual(self.store.list_inventory()[0]["currentUnits"], 30)

        filename, pdf = self.store.supplier_invoice_pdf(supplier_order["id"])
        self.assertEqual(filename, "PO0001_supplier_invoice.pdf")
        self.assertTrue(pdf.startswith(b"%PDF-1.4"))

    def test_home_summary_sales_quantities_and_alerts(self) -> None:
        medicine = self.create_medicine()
        supplier = self.create_supplier()
        self.store.correct_inventory(
            medicine["id"],
            {"currentUnits": "5", "replenishmentLevel": "5", "refillBufferUnits": "5"},
        )
        self.store.create_sales_order(
            {
                "orderDate": today_iso(),
                "items": [{"medicineId": medicine["id"], "qtySold": "1", "unitPrice": "12.50"}],
            }
        )
        self.store.create_supplier_order(
            {
                "supplierId": supplier["id"],
                "orderDate": "2026-06-01",
                "expectedDeliveryDate": "2026-06-05",
                "status": "sent",
                "items": [{"medicineId": medicine["id"], "qtyOrdered": "10", "committedUnitPrice": "8.00"}],
            }
        )

        summary = self.store.home_summary()
        self.assertGreaterEqual(summary["ytdQtySold"], 1)
        self.assertTrue(summary["lowStockMedicines"])
        self.assertEqual(summary["pendingSupplierOrdersTotal"], 1)
        self.assertIn("LOW_STOCK", {alert["alertType"] for alert in summary["alerts"]})


if __name__ == "__main__":
    unittest.main()
