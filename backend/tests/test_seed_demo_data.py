from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from seed_demo_data import seed_demo_data  # noqa: E402
from sqlite_store import SQLiteStore  # noqa: E402


class SeedDemoDataTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.store = SQLiteStore(Path(self.temp_dir.name) / "medtrack.sqlite3")

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_seed_demo_data_appends_expected_records_and_pdfs(self) -> None:
        result = seed_demo_data(self.store)

        self.assertEqual(result["medicinesCreated"], 100)
        self.assertEqual(result["suppliersCreated"], 5)
        self.assertEqual(result["supplierOrdersCreated"], 5)
        self.assertEqual(result["salesOrdersCreated"], 5)
        self.assertEqual(result["pdfsCreated"], 10)

        medicines = self.store.list_medicines()
        demo_medicines = [medicine for medicine in medicines if medicine["skuCode"].startswith("DEMO-MED-")]
        self.assertEqual(len(demo_medicines), 100)

        with self.store.connect() as conn:
            inventory_count = conn.execute(
                """
                SELECT COUNT(*) AS count
                FROM inventory i JOIN medicines m ON m.id = i.medicine_id
                WHERE m.sku_code LIKE 'DEMO-MED-%'
                """
            ).fetchone()["count"]
            supplier_order_count = conn.execute(
                "SELECT COUNT(*) AS count FROM supplier_orders WHERE notes LIKE '%Demo seed data%'"
            ).fetchone()["count"]
            supplier_order_item_count = conn.execute(
                """
                SELECT COUNT(*) AS count
                FROM supplier_order_items soi
                JOIN supplier_orders so ON so.id = soi.supplier_order_id
                WHERE so.notes LIKE '%Demo seed data%'
                """
            ).fetchone()["count"]
            sales_order_count = conn.execute(
                "SELECT COUNT(*) AS count FROM sales_orders WHERE customer_name LIKE 'Demo Customer %'"
            ).fetchone()["count"]
            sale_movements = conn.execute(
                "SELECT COUNT(*) AS count FROM stock_movements WHERE movement_type = 'SALE'"
            ).fetchone()["count"]
            supplier_receipts = conn.execute(
                "SELECT COUNT(*) AS count FROM stock_movements WHERE movement_type = 'SUPPLIER_RECEIPT'"
            ).fetchone()["count"]
            document_count = conn.execute(
                "SELECT COUNT(*) AS count FROM documents"
            ).fetchone()["count"]

        self.assertEqual(inventory_count, 100)
        self.assertEqual(supplier_order_count, 5)
        self.assertGreaterEqual(supplier_order_item_count, 15)
        self.assertEqual(sales_order_count, 5)
        self.assertGreater(sale_movements, 0)
        self.assertGreater(supplier_receipts, 0)
        self.assertEqual(document_count, 10)

        pdfs = list((Path(self.temp_dir.name) / "documents").glob("*.pdf"))
        self.assertEqual(len(pdfs), 10)

        summary = self.store.home_summary()
        self.assertGreaterEqual(len(summary["lowStockMedicines"]), 20)
        self.assertGreaterEqual(len(summary["refillSoonMedicines"]), 25)
        self.assertGreater(summary["todayQtySold"], 0)
        self.assertGreater(summary["ytdQtySold"], 0)
        self.assertNotEqual(summary["todaySalesValue"], "0.00")
        self.assertNotEqual(summary["ytdSalesValue"], "0.00")

    def test_seed_demo_data_is_append_only(self) -> None:
        first = seed_demo_data(self.store)
        second = seed_demo_data(self.store)

        self.assertEqual(first["medicinesCreated"], 100)
        self.assertEqual(second["medicinesCreated"], 100)
        demo_medicines = [medicine for medicine in self.store.list_medicines() if medicine["skuCode"].startswith("DEMO-MED-")]
        self.assertEqual(len(demo_medicines), 200)


if __name__ == "__main__":
    unittest.main()
