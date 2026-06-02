from __future__ import annotations

import os
import re
import sqlite3
from datetime import date, datetime
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path
from textwrap import wrap
from typing import Any


DEFAULT_DATA_DIR = Path(__file__).resolve().parents[1] / "data"
DEFAULT_DB_PATH = DEFAULT_DATA_DIR / "medtrack.sqlite3"

SALE_STATUSES = {"completed", "cancelled"}
SUPPLIER_ORDER_STATUSES = {
    "draft",
    "sent",
    "awaiting confirmation",
    "confirmed",
    "partially received",
    "received",
    "cancelled",
    "overdue",
}
PENDING_SUPPLIER_STATUSES = {"sent", "awaiting confirmation"}


class ValidationError(Exception):
    def __init__(
        self,
        message: str,
        *,
        code: str = "VALIDATION_ERROR",
        status: int = 400,
        errors: list[str] | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.code = code
        self.status = status
        self.errors = errors or [message]

    def to_payload(self) -> dict[str, Any]:
        return {"ok": False, "code": self.code, "message": self.message, "errors": self.errors}


class ManagedConnection(sqlite3.Connection):
    def __exit__(self, exc_type, exc_value, traceback) -> bool:
        result = super().__exit__(exc_type, exc_value, traceback)
        self.close()
        return result


def now_text() -> str:
    return datetime.now().replace(microsecond=0).isoformat(sep=" ")


def today_iso() -> str:
    return date.today().isoformat()


def get_value(payload: dict[str, Any], *keys: str, default: Any = "") -> Any:
    for key in keys:
        if key in payload and payload[key] is not None:
            return payload[key]
    return default


def parse_date(value: Any, field_name: str, *, default_today: bool = False) -> str:
    text = str(value or "").strip()
    if not text and default_today:
        return today_iso()
    if not text:
        raise ValidationError(f"{field_name} is required.", errors=[f"{field_name} is required."])

    for fmt in ("%Y-%m-%d", "%d-%m-%Y"):
        try:
            return datetime.strptime(text, fmt).date().isoformat()
        except ValueError:
            pass
    raise ValidationError(f"{field_name} must be a valid date.", errors=[f"{field_name} must be YYYY-MM-DD."])


def parse_money(value: Any, field_name: str, *, default: Decimal | None = None) -> Decimal:
    text = str(value if value is not None else "").strip()
    if text == "" and default is not None:
        return default
    if text == "":
        raise ValidationError(f"{field_name} is required.", errors=[f"{field_name} is required."])
    try:
        amount = Decimal(text)
    except InvalidOperation as exc:
        raise ValidationError(f"{field_name} must be a valid number.", errors=[f"{field_name} must be a valid number."]) from exc
    if amount < 0:
        raise ValidationError(f"{field_name} cannot be negative.", errors=[f"{field_name} cannot be negative."])
    return amount


def parse_positive_int(value: Any, field_name: str) -> int:
    text = str(value if value is not None else "").strip()
    if not re.fullmatch(r"\d+", text):
        raise ValidationError(f"{field_name} must be a positive whole number.", errors=[f"{field_name} must be a positive whole number."])
    number = int(text)
    if number <= 0:
        raise ValidationError(f"{field_name} must be greater than zero.", errors=[f"{field_name} must be greater than zero."])
    return number


def parse_non_negative_int(value: Any, field_name: str, *, default: int | None = None) -> int:
    text = str(value if value is not None else "").strip()
    if text == "" and default is not None:
        return default
    if not re.fullmatch(r"\d+", text):
        raise ValidationError(f"{field_name} must be a non-negative whole number.", errors=[f"{field_name} must be a non-negative whole number."])
    return int(text)


def parse_rating(value: Any) -> int:
    rating = parse_non_negative_int(value, "Reliability rating", default=3)
    if rating < 1 or rating > 5:
        raise ValidationError("Reliability rating must be between 1 and 5.", errors=["Reliability rating must be between 1 and 5."])
    return rating


def money_text(value: Any) -> str:
    amount = Decimal(str(value if value is not None else "0"))
    return f"{amount.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP):.2f}"


def row_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    return dict(row) if row is not None else None


def bool_int(value: Any) -> int:
    return 1 if value in (True, 1, "1", "true", "True", "yes", "on") else 0


class SQLiteStore:
    def __init__(self, db_path: Path | str | None = None) -> None:
        configured = db_path or os.environ.get("MEDTRACK_DB_PATH") or DEFAULT_DB_PATH
        self.db_path = Path(configured)
        self.data_dir = self.db_path.parent
        self.documents_dir = self.data_dir / "documents"
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.documents_dir.mkdir(parents=True, exist_ok=True)
        self.init_schema()

    def connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, factory=ManagedConnection)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    def init_schema(self) -> None:
        with self.connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS medicines (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    sku_code TEXT NOT NULL COLLATE NOCASE UNIQUE,
                    sku_name TEXT NOT NULL COLLATE NOCASE UNIQUE,
                    medicine_name TEXT NOT NULL,
                    category TEXT NOT NULL DEFAULT '',
                    brand TEXT NOT NULL DEFAULT '',
                    form TEXT NOT NULL DEFAULT '',
                    strength TEXT NOT NULL DEFAULT '',
                    pack_size TEXT NOT NULL DEFAULT '',
                    cost_price NUMERIC NOT NULL DEFAULT 0,
                    selling_price NUMERIC NOT NULL DEFAULT 0,
                    is_active INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS inventory (
                    medicine_id INTEGER PRIMARY KEY,
                    current_units INTEGER NOT NULL DEFAULT 0,
                    replenishment_level INTEGER NOT NULL DEFAULT 0,
                    refill_buffer_units INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (medicine_id) REFERENCES medicines(id)
                );

                CREATE TABLE IF NOT EXISTS stock_movements (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    medicine_id INTEGER NOT NULL,
                    movement_type TEXT NOT NULL,
                    qty_delta INTEGER NOT NULL,
                    source_type TEXT NOT NULL,
                    source_id INTEGER,
                    unit_value NUMERIC NOT NULL DEFAULT 0,
                    note TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (medicine_id) REFERENCES medicines(id)
                );

                CREATE TABLE IF NOT EXISTS sales_orders (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    order_no TEXT NOT NULL UNIQUE,
                    order_date TEXT NOT NULL,
                    customer_name TEXT,
                    customer_phone TEXT,
                    subtotal NUMERIC NOT NULL,
                    discount_amount NUMERIC NOT NULL DEFAULT 0,
                    total_amount NUMERIC NOT NULL,
                    status TEXT NOT NULL CHECK(status IN ('completed','cancelled')),
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS sales_order_items (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    sales_order_id INTEGER NOT NULL,
                    medicine_id INTEGER NOT NULL,
                    qty_sold INTEGER NOT NULL,
                    unit_price NUMERIC NOT NULL,
                    discount_amount NUMERIC NOT NULL DEFAULT 0,
                    line_total NUMERIC NOT NULL,
                    FOREIGN KEY (sales_order_id) REFERENCES sales_orders(id),
                    FOREIGN KEY (medicine_id) REFERENCES medicines(id)
                );

                CREATE TABLE IF NOT EXISTS suppliers (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    supplier_name TEXT NOT NULL COLLATE NOCASE UNIQUE,
                    phone TEXT NOT NULL DEFAULT '',
                    contact_person TEXT NOT NULL DEFAULT '',
                    reliability_rating INTEGER NOT NULL DEFAULT 3 CHECK(reliability_rating BETWEEN 1 AND 5),
                    is_active INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS supplier_orders (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    po_no TEXT NOT NULL UNIQUE,
                    supplier_id INTEGER NOT NULL,
                    order_date TEXT NOT NULL,
                    expected_delivery_date TEXT NOT NULL,
                    status TEXT NOT NULL,
                    discount_amount NUMERIC NOT NULL DEFAULT 0,
                    reliability_snapshot INTEGER NOT NULL,
                    follow_up_phone TEXT NOT NULL DEFAULT '',
                    notes TEXT NOT NULL DEFAULT '',
                    total_committed_value NUMERIC NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
                );

                CREATE TABLE IF NOT EXISTS supplier_order_items (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    supplier_order_id INTEGER NOT NULL,
                    medicine_id INTEGER NOT NULL,
                    qty_ordered INTEGER NOT NULL,
                    qty_received INTEGER NOT NULL DEFAULT 0,
                    committed_unit_price NUMERIC NOT NULL,
                    discount_amount NUMERIC NOT NULL DEFAULT 0,
                    line_total NUMERIC NOT NULL,
                    FOREIGN KEY (supplier_order_id) REFERENCES supplier_orders(id),
                    FOREIGN KEY (medicine_id) REFERENCES medicines(id)
                );

                CREATE TABLE IF NOT EXISTS documents (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    document_type TEXT NOT NULL,
                    source_type TEXT NOT NULL,
                    source_id INTEGER NOT NULL,
                    file_path TEXT NOT NULL,
                    generated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS notification_state (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    alert_key TEXT NOT NULL UNIQUE,
                    alert_type TEXT NOT NULL,
                    entity_type TEXT NOT NULL,
                    entity_id INTEGER NOT NULL,
                    dismissed_until TEXT,
                    resolved_at TEXT
                );

                CREATE INDEX IF NOT EXISTS idx_sales_orders_date ON sales_orders(order_date);
                CREATE INDEX IF NOT EXISTS idx_supplier_orders_status ON supplier_orders(status);
                CREATE INDEX IF NOT EXISTS idx_stock_movements_medicine ON stock_movements(medicine_id);
                """
            )

    def health(self) -> dict[str, Any]:
        with self.connect() as conn:
            conn.execute("SELECT 1").fetchone()
        return {"ok": True, "database": str(self.db_path)}

    def _next_number(self, conn: sqlite3.Connection, table: str, column: str, prefix: str) -> str:
        row = conn.execute(
            f"SELECT MAX(CAST(SUBSTR({column}, ?) AS INTEGER)) AS max_no FROM {table} WHERE {column} LIKE ?",
            (len(prefix) + 1, f"{prefix}%"),
        ).fetchone()
        return f"{prefix}{int(row['max_no'] or 0) + 1:04d}"

    def _medicine_payload(self, payload: dict[str, Any], existing: dict[str, Any] | None = None) -> dict[str, Any]:
        base = existing or {}
        cost_default = Decimal(str(base.get("cost_price", "0")))
        selling_default = Decimal(str(base.get("selling_price", cost_default)))
        cost_price = parse_money(get_value(payload, "costPrice", "cost_price", "Cost", default=cost_default), "Cost price")
        selling_price = parse_money(
            get_value(payload, "sellingPrice", "selling_price", default=selling_default),
            "Selling price",
            default=cost_price,
        )
        data = {
            "sku_code": str(get_value(payload, "skuCode", "sku_code", "SKU Id", default=base.get("sku_code", ""))).strip(),
            "sku_name": str(get_value(payload, "skuName", "sku_name", "SKU Name", default=base.get("sku_name", ""))).strip(),
            "medicine_name": str(get_value(payload, "medicineName", "medicine_name", "Medicine Name", default=base.get("medicine_name", ""))).strip(),
            "category": str(get_value(payload, "category", "Category of Medicine", default=base.get("category", ""))).strip(),
            "brand": str(get_value(payload, "brand", "Brand", default=base.get("brand", ""))).strip(),
            "form": str(get_value(payload, "form", "Form", default=base.get("form", ""))).strip(),
            "strength": str(get_value(payload, "strength", "Strength", default=base.get("strength", ""))).strip(),
            "pack_size": str(get_value(payload, "packSize", "pack_size", "Pack Size", default=base.get("pack_size", ""))).strip(),
            "cost_price": money_text(cost_price),
            "selling_price": money_text(selling_price),
            "is_active": bool_int(get_value(payload, "isActive", "is_active", default=base.get("is_active", 1))),
        }
        missing = [name for name in ("sku_code", "sku_name", "medicine_name") if not data[name]]
        if missing:
            raise ValidationError("Required medicine fields are missing.", errors=[f"{name} is required." for name in missing])
        return data

    def _medicine_response(self, row: sqlite3.Row | dict[str, Any]) -> dict[str, Any]:
        data = dict(row)
        return {
            "id": data["id"],
            "skuCode": data["sku_code"],
            "skuName": data["sku_name"],
            "medicineName": data["medicine_name"],
            "category": data["category"],
            "brand": data["brand"],
            "form": data["form"],
            "strength": data["strength"],
            "packSize": data["pack_size"],
            "costPrice": money_text(data["cost_price"]),
            "sellingPrice": money_text(data["selling_price"]),
            "isActive": bool(data["is_active"]),
            "currentUnits": data.get("current_units"),
            "replenishmentLevel": data.get("replenishment_level"),
            "refillBufferUnits": data.get("refill_buffer_units"),
        }

    def list_medicines(self, *, include_archived: bool = False) -> list[dict[str, Any]]:
        where = "" if include_archived else "WHERE m.is_active = 1"
        with self.connect() as conn:
            rows = conn.execute(
                f"""
                SELECT m.*, i.current_units, i.replenishment_level, i.refill_buffer_units
                FROM medicines m
                LEFT JOIN inventory i ON i.medicine_id = m.id
                {where}
                ORDER BY m.medicine_name, m.sku_code
                """
            ).fetchall()
        return [self._medicine_response(row) for row in rows]

    def get_medicine(self, conn: sqlite3.Connection, medicine_id: int, *, active_only: bool = False) -> sqlite3.Row:
        active_clause = "AND is_active = 1" if active_only else ""
        row = conn.execute(f"SELECT * FROM medicines WHERE id = ? {active_clause}", (medicine_id,)).fetchone()
        if row is None:
            raise ValidationError("Medicine was not found.", code="NOT_FOUND", status=404, errors=["Medicine was not found."])
        return row

    def create_medicine(self, payload: dict[str, Any]) -> dict[str, Any]:
        data = self._medicine_payload(payload)
        current_units = parse_non_negative_int(get_value(payload, "currentUnits", "current_units", default=0), "Current units", default=0)
        replenishment = parse_non_negative_int(get_value(payload, "replenishmentLevel", "replenishment_level", default=0), "Replenishment level", default=0)
        refill_buffer = parse_non_negative_int(get_value(payload, "refillBufferUnits", "refill_buffer_units", default=0), "Refill buffer units", default=0)
        with self.connect() as conn:
            try:
                cursor = conn.execute(
                    """
                    INSERT INTO medicines (
                        sku_code, sku_name, medicine_name, category, brand, form, strength, pack_size,
                        cost_price, selling_price, is_active
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        data["sku_code"],
                        data["sku_name"],
                        data["medicine_name"],
                        data["category"],
                        data["brand"],
                        data["form"],
                        data["strength"],
                        data["pack_size"],
                        data["cost_price"],
                        data["selling_price"],
                        data["is_active"],
                    ),
                )
            except sqlite3.IntegrityError as exc:
                raise ValidationError("Duplicate SKU code or SKU name.", code="DUPLICATE_MEDICINE", errors=["SKU code and SKU name must be unique."]) from exc

            medicine_id = cursor.lastrowid
            conn.execute(
                """
                INSERT INTO inventory (medicine_id, current_units, replenishment_level, refill_buffer_units)
                VALUES (?, ?, ?, ?)
                """,
                (medicine_id, current_units, replenishment, refill_buffer),
            )
            if current_units:
                conn.execute(
                    """
                    INSERT INTO stock_movements (medicine_id, movement_type, qty_delta, source_type, source_id, unit_value, note)
                    VALUES (?, 'OPENING_STOCK', ?, 'medicine', ?, ?, 'Opening stock')
                    """,
                    (medicine_id, current_units, medicine_id, data["cost_price"]),
                )
            row = conn.execute(
                """
                SELECT m.*, i.current_units, i.replenishment_level, i.refill_buffer_units
                FROM medicines m JOIN inventory i ON i.medicine_id = m.id WHERE m.id = ?
                """,
                (medicine_id,),
            ).fetchone()
        return self._medicine_response(row)

    def update_medicine(self, medicine_id: int, payload: dict[str, Any]) -> dict[str, Any]:
        with self.connect() as conn:
            existing = row_dict(self.get_medicine(conn, medicine_id))
            data = self._medicine_payload(payload, existing)
            try:
                conn.execute(
                    """
                    UPDATE medicines
                    SET sku_code = ?, sku_name = ?, medicine_name = ?, category = ?, brand = ?, form = ?,
                        strength = ?, pack_size = ?, cost_price = ?, selling_price = ?, is_active = ?, updated_at = ?
                    WHERE id = ?
                    """,
                    (
                        data["sku_code"],
                        data["sku_name"],
                        data["medicine_name"],
                        data["category"],
                        data["brand"],
                        data["form"],
                        data["strength"],
                        data["pack_size"],
                        data["cost_price"],
                        data["selling_price"],
                        data["is_active"],
                        now_text(),
                        medicine_id,
                    ),
                )
            except sqlite3.IntegrityError as exc:
                raise ValidationError("Duplicate SKU code or SKU name.", code="DUPLICATE_MEDICINE", errors=["SKU code and SKU name must be unique."]) from exc

            inventory_updates: list[str] = []
            params: list[Any] = []
            if "replenishmentLevel" in payload or "replenishment_level" in payload:
                inventory_updates.append("replenishment_level = ?")
                params.append(parse_non_negative_int(get_value(payload, "replenishmentLevel", "replenishment_level"), "Replenishment level"))
            if "refillBufferUnits" in payload or "refill_buffer_units" in payload:
                inventory_updates.append("refill_buffer_units = ?")
                params.append(parse_non_negative_int(get_value(payload, "refillBufferUnits", "refill_buffer_units"), "Refill buffer units"))
            if inventory_updates:
                inventory_updates.append("updated_at = ?")
                params.extend([now_text(), medicine_id])
                conn.execute(f"UPDATE inventory SET {', '.join(inventory_updates)} WHERE medicine_id = ?", params)

            row = conn.execute(
                """
                SELECT m.*, i.current_units, i.replenishment_level, i.refill_buffer_units
                FROM medicines m JOIN inventory i ON i.medicine_id = m.id WHERE m.id = ?
                """,
                (medicine_id,),
            ).fetchone()
        return self._medicine_response(row)

    def archive_medicine(self, medicine_id: int) -> dict[str, Any]:
        with self.connect() as conn:
            self.get_medicine(conn, medicine_id)
            conn.execute("UPDATE medicines SET is_active = 0, updated_at = ? WHERE id = ?", (now_text(), medicine_id))
            row = conn.execute(
                """
                SELECT m.*, i.current_units, i.replenishment_level, i.refill_buffer_units
                FROM medicines m JOIN inventory i ON i.medicine_id = m.id WHERE m.id = ?
                """,
                (medicine_id,),
            ).fetchone()
        return self._medicine_response(row)

    def _inventory_response(self, row: sqlite3.Row) -> dict[str, Any]:
        data = dict(row)
        units = int(data["current_units"])
        level = int(data["replenishment_level"])
        buffer_units = int(data["refill_buffer_units"])
        if level > 0 and units <= level:
            status = "LOW_STOCK"
        elif units <= level + buffer_units:
            status = "REFILL_SOON"
        else:
            status = "OK"
        return {
            "medicineId": data["medicine_id"],
            "skuCode": data["sku_code"],
            "skuName": data["sku_name"],
            "medicineName": data["medicine_name"],
            "brand": data["brand"],
            "currentUnits": units,
            "replenishmentLevel": level,
            "refillBufferUnits": buffer_units,
            "status": status,
            "isActive": bool(data["is_active"]),
        }

    def list_inventory(self) -> list[dict[str, Any]]:
        with self.connect() as conn:
            rows = conn.execute(
                """
                SELECT i.*, m.sku_code, m.sku_name, m.medicine_name, m.brand, m.is_active
                FROM inventory i JOIN medicines m ON m.id = i.medicine_id
                WHERE m.is_active = 1
                ORDER BY m.medicine_name, m.sku_code
                """
            ).fetchall()
        return [self._inventory_response(row) for row in rows]

    def correct_inventory(self, medicine_id: int, payload: dict[str, Any]) -> dict[str, Any]:
        with self.connect() as conn:
            self.get_medicine(conn, medicine_id)
            current = conn.execute("SELECT * FROM inventory WHERE medicine_id = ?", (medicine_id,)).fetchone()
            if current is None:
                raise ValidationError("Inventory row was not found.", code="NOT_FOUND", status=404, errors=["Inventory row was not found."])

            new_units = int(current["current_units"])
            replenishment = int(current["replenishment_level"])
            refill_buffer = int(current["refill_buffer_units"])
            if "currentUnits" in payload or "current_units" in payload:
                new_units = parse_non_negative_int(get_value(payload, "currentUnits", "current_units"), "Current units")
            if "replenishmentLevel" in payload or "replenishment_level" in payload:
                replenishment = parse_non_negative_int(get_value(payload, "replenishmentLevel", "replenishment_level"), "Replenishment level")
            if "refillBufferUnits" in payload or "refill_buffer_units" in payload:
                refill_buffer = parse_non_negative_int(get_value(payload, "refillBufferUnits", "refill_buffer_units"), "Refill buffer units")

            delta = new_units - int(current["current_units"])
            conn.execute(
                """
                UPDATE inventory
                SET current_units = ?, replenishment_level = ?, refill_buffer_units = ?, updated_at = ?
                WHERE medicine_id = ?
                """,
                (new_units, replenishment, refill_buffer, now_text(), medicine_id),
            )
            if delta:
                conn.execute(
                    """
                    INSERT INTO stock_movements (medicine_id, movement_type, qty_delta, source_type, source_id, note)
                    VALUES (?, 'CORRECTION', ?, 'inventory', ?, 'Manual stock correction')
                    """,
                    (medicine_id, delta, medicine_id),
                )
            row = conn.execute(
                """
                SELECT i.*, m.sku_code, m.sku_name, m.medicine_name, m.brand, m.is_active
                FROM inventory i JOIN medicines m ON m.id = i.medicine_id WHERE i.medicine_id = ?
                """,
                (medicine_id,),
            ).fetchone()
        return self._inventory_response(row)

    def _sale_order_response(self, conn: sqlite3.Connection, sales_order_id: int) -> dict[str, Any]:
        order = conn.execute("SELECT * FROM sales_orders WHERE id = ?", (sales_order_id,)).fetchone()
        if order is None:
            raise ValidationError("Sales order was not found.", code="NOT_FOUND", status=404, errors=["Sales order was not found."])
        items = conn.execute(
            """
            SELECT soi.*, m.sku_code, m.sku_name, m.medicine_name, m.brand
            FROM sales_order_items soi JOIN medicines m ON m.id = soi.medicine_id
            WHERE soi.sales_order_id = ?
            ORDER BY soi.id
            """,
            (sales_order_id,),
        ).fetchall()
        return {
            "id": order["id"],
            "orderNo": order["order_no"],
            "orderDate": order["order_date"],
            "customerName": order["customer_name"] or "",
            "customerPhone": order["customer_phone"] or "",
            "subtotal": money_text(order["subtotal"]),
            "discountAmount": money_text(order["discount_amount"]),
            "totalAmount": money_text(order["total_amount"]),
            "status": order["status"],
            "receiptUrl": f"/sales-orders/{order['id']}/receipt.pdf",
            "items": [
                {
                    "id": item["id"],
                    "medicineId": item["medicine_id"],
                    "skuCode": item["sku_code"],
                    "skuName": item["sku_name"],
                    "medicineName": item["medicine_name"],
                    "brand": item["brand"],
                    "qtySold": item["qty_sold"],
                    "unitPrice": money_text(item["unit_price"]),
                    "discountAmount": money_text(item["discount_amount"]),
                    "lineTotal": money_text(item["line_total"]),
                }
                for item in items
            ],
        }

    def list_sales_orders(self, limit: int = 50) -> list[dict[str, Any]]:
        with self.connect() as conn:
            rows = conn.execute("SELECT id FROM sales_orders ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
            return [self._sale_order_response(conn, row["id"]) for row in rows]

    def create_sales_order(self, payload: dict[str, Any]) -> dict[str, Any]:
        lines = payload.get("items") or payload.get("lines")
        if not isinstance(lines, list) or not lines:
            raise ValidationError("At least one sales order item is required.", errors=["At least one sales order item is required."])

        order_date = parse_date(get_value(payload, "orderDate", "order_date", "date", default=""), "Order date", default_today=True)
        order_discount = parse_money(get_value(payload, "discountAmount", "discount_amount", default=0), "Order discount", default=Decimal("0"))
        customer_name = str(get_value(payload, "customerName", "customer_name", default="")).strip()
        customer_phone = str(get_value(payload, "customerPhone", "customer_phone", default="")).strip()

        with self.connect() as conn:
            parsed_lines: list[dict[str, Any]] = []
            seen: set[int] = set()
            for index, line in enumerate(lines, start=1):
                medicine_id = parse_positive_int(get_value(line, "medicineId", "medicine_id"), f"Line {index} medicine")
                if medicine_id in seen:
                    raise ValidationError("Duplicate medicine rows are not allowed.", errors=[f"Line {index}: duplicate medicine."])
                seen.add(medicine_id)
                medicine = self.get_medicine(conn, medicine_id, active_only=True)
                inventory = conn.execute("SELECT current_units FROM inventory WHERE medicine_id = ?", (medicine_id,)).fetchone()
                qty = parse_positive_int(get_value(line, "qtySold", "qty_sold", "quantity"), f"Line {index} quantity")
                available = int(inventory["current_units"])
                if qty > available:
                    raise ValidationError(
                        "Insufficient inventory for sales order.",
                        code="INSUFFICIENT_INVENTORY",
                        status=409,
                        errors=[f"{medicine['sku_name']} has {available} units available; {qty} requested."],
                    )
                unit_price = parse_money(get_value(line, "unitPrice", "unit_price", default=medicine["selling_price"]), f"Line {index} unit price")
                line_discount = parse_money(get_value(line, "discountAmount", "discount_amount", default=0), f"Line {index} discount", default=Decimal("0"))
                line_total = (unit_price * qty) - line_discount
                if line_total < 0:
                    raise ValidationError("Line discount cannot exceed line value.", errors=[f"Line {index}: discount exceeds line value."])
                parsed_lines.append(
                    {
                        "medicine": medicine,
                        "qty": qty,
                        "unit_price": unit_price,
                        "discount": line_discount,
                        "line_total": line_total,
                    }
                )

            subtotal = sum((line["unit_price"] * line["qty"] for line in parsed_lines), Decimal("0"))
            item_discounts = sum((line["discount"] for line in parsed_lines), Decimal("0"))
            total = subtotal - item_discounts - order_discount
            if total < 0:
                raise ValidationError("Order discount cannot exceed order value.", errors=["Order discount cannot exceed order value."])

            order_no = self._next_number(conn, "sales_orders", "order_no", "SO")
            cursor = conn.execute(
                """
                INSERT INTO sales_orders (
                    order_no, order_date, customer_name, customer_phone, subtotal,
                    discount_amount, total_amount, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 'completed')
                """,
                (order_no, order_date, customer_name, customer_phone, money_text(subtotal), money_text(order_discount), money_text(total)),
            )
            sales_order_id = cursor.lastrowid
            for line in parsed_lines:
                medicine_id = line["medicine"]["id"]
                conn.execute(
                    """
                    INSERT INTO sales_order_items (
                        sales_order_id, medicine_id, qty_sold, unit_price, discount_amount, line_total
                    ) VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (
                        sales_order_id,
                        medicine_id,
                        line["qty"],
                        money_text(line["unit_price"]),
                        money_text(line["discount"]),
                        money_text(line["line_total"]),
                    ),
                )
                conn.execute(
                    "UPDATE inventory SET current_units = current_units - ?, updated_at = ? WHERE medicine_id = ?",
                    (line["qty"], now_text(), medicine_id),
                )
                conn.execute(
                    """
                    INSERT INTO stock_movements (medicine_id, movement_type, qty_delta, source_type, source_id, unit_value, note)
                    VALUES (?, 'SALE', ?, 'sales_order', ?, ?, ?)
                    """,
                    (medicine_id, -line["qty"], sales_order_id, money_text(line["unit_price"]), order_no),
                )
            return self._sale_order_response(conn, sales_order_id)

    def _supplier_payload(self, payload: dict[str, Any], existing: dict[str, Any] | None = None) -> dict[str, Any]:
        base = existing or {}
        supplier_name = str(get_value(payload, "supplierName", "supplier_name", default=base.get("supplier_name", ""))).strip()
        if not supplier_name:
            raise ValidationError("Supplier name is required.", errors=["Supplier name is required."])
        return {
            "supplier_name": supplier_name,
            "phone": str(get_value(payload, "phone", default=base.get("phone", ""))).strip(),
            "contact_person": str(get_value(payload, "contactPerson", "contact_person", default=base.get("contact_person", ""))).strip(),
            "reliability_rating": parse_rating(get_value(payload, "reliabilityRating", "reliability_rating", default=base.get("reliability_rating", 3))),
            "is_active": bool_int(get_value(payload, "isActive", "is_active", default=base.get("is_active", 1))),
        }

    def _supplier_response(self, row: sqlite3.Row | dict[str, Any]) -> dict[str, Any]:
        data = dict(row)
        return {
            "id": data["id"],
            "supplierName": data["supplier_name"],
            "phone": data["phone"],
            "contactPerson": data["contact_person"],
            "reliabilityRating": data["reliability_rating"],
            "isActive": bool(data["is_active"]),
        }

    def list_suppliers(self, *, include_archived: bool = False) -> list[dict[str, Any]]:
        where = "" if include_archived else "WHERE is_active = 1"
        with self.connect() as conn:
            rows = conn.execute(f"SELECT * FROM suppliers {where} ORDER BY supplier_name").fetchall()
        return [self._supplier_response(row) for row in rows]

    def create_supplier(self, payload: dict[str, Any]) -> dict[str, Any]:
        data = self._supplier_payload(payload)
        with self.connect() as conn:
            try:
                cursor = conn.execute(
                    """
                    INSERT INTO suppliers (supplier_name, phone, contact_person, reliability_rating, is_active)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (data["supplier_name"], data["phone"], data["contact_person"], data["reliability_rating"], data["is_active"]),
                )
            except sqlite3.IntegrityError as exc:
                raise ValidationError("Duplicate supplier name.", code="DUPLICATE_SUPPLIER", errors=["Supplier name must be unique."]) from exc
            row = conn.execute("SELECT * FROM suppliers WHERE id = ?", (cursor.lastrowid,)).fetchone()
        return self._supplier_response(row)

    def update_supplier(self, supplier_id: int, payload: dict[str, Any]) -> dict[str, Any]:
        with self.connect() as conn:
            existing = conn.execute("SELECT * FROM suppliers WHERE id = ?", (supplier_id,)).fetchone()
            if existing is None:
                raise ValidationError("Supplier was not found.", code="NOT_FOUND", status=404, errors=["Supplier was not found."])
            data = self._supplier_payload(payload, row_dict(existing))
            try:
                conn.execute(
                    """
                    UPDATE suppliers
                    SET supplier_name = ?, phone = ?, contact_person = ?, reliability_rating = ?, is_active = ?, updated_at = ?
                    WHERE id = ?
                    """,
                    (
                        data["supplier_name"],
                        data["phone"],
                        data["contact_person"],
                        data["reliability_rating"],
                        data["is_active"],
                        now_text(),
                        supplier_id,
                    ),
                )
            except sqlite3.IntegrityError as exc:
                raise ValidationError("Duplicate supplier name.", code="DUPLICATE_SUPPLIER", errors=["Supplier name must be unique."]) from exc
            row = conn.execute("SELECT * FROM suppliers WHERE id = ?", (supplier_id,)).fetchone()
        return self._supplier_response(row)

    def archive_supplier(self, supplier_id: int) -> dict[str, Any]:
        with self.connect() as conn:
            row = conn.execute("SELECT * FROM suppliers WHERE id = ?", (supplier_id,)).fetchone()
            if row is None:
                raise ValidationError("Supplier was not found.", code="NOT_FOUND", status=404, errors=["Supplier was not found."])
            conn.execute("UPDATE suppliers SET is_active = 0, updated_at = ? WHERE id = ?", (now_text(), supplier_id))
            row = conn.execute("SELECT * FROM suppliers WHERE id = ?", (supplier_id,)).fetchone()
        return self._supplier_response(row)

    def _supplier_order_response(self, conn: sqlite3.Connection, supplier_order_id: int) -> dict[str, Any]:
        order = conn.execute(
            """
            SELECT so.*, s.supplier_name, s.phone, s.contact_person
            FROM supplier_orders so JOIN suppliers s ON s.id = so.supplier_id
            WHERE so.id = ?
            """,
            (supplier_order_id,),
        ).fetchone()
        if order is None:
            raise ValidationError("Supplier order was not found.", code="NOT_FOUND", status=404, errors=["Supplier order was not found."])
        items = conn.execute(
            """
            SELECT soi.*, m.sku_code, m.sku_name, m.medicine_name, m.brand
            FROM supplier_order_items soi JOIN medicines m ON m.id = soi.medicine_id
            WHERE soi.supplier_order_id = ?
            ORDER BY soi.id
            """,
            (supplier_order_id,),
        ).fetchall()
        return {
            "id": order["id"],
            "poNo": order["po_no"],
            "supplierId": order["supplier_id"],
            "supplierName": order["supplier_name"],
            "supplierPhone": order["phone"],
            "contactPerson": order["contact_person"],
            "orderDate": order["order_date"],
            "expectedDeliveryDate": order["expected_delivery_date"],
            "status": order["status"],
            "discountAmount": money_text(order["discount_amount"]),
            "reliabilitySnapshot": order["reliability_snapshot"],
            "followUpPhone": order["follow_up_phone"],
            "notes": order["notes"],
            "totalCommittedValue": money_text(order["total_committed_value"]),
            "invoiceUrl": f"/supplier-orders/{order['id']}/invoice.pdf",
            "items": [
                {
                    "id": item["id"],
                    "medicineId": item["medicine_id"],
                    "skuCode": item["sku_code"],
                    "skuName": item["sku_name"],
                    "medicineName": item["medicine_name"],
                    "brand": item["brand"],
                    "qtyOrdered": item["qty_ordered"],
                    "qtyReceived": item["qty_received"],
                    "committedUnitPrice": money_text(item["committed_unit_price"]),
                    "discountAmount": money_text(item["discount_amount"]),
                    "lineTotal": money_text(item["line_total"]),
                }
                for item in items
            ],
        }

    def list_supplier_orders(self, limit: int = 100) -> list[dict[str, Any]]:
        with self.connect() as conn:
            rows = conn.execute("SELECT id FROM supplier_orders ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
            return [self._supplier_order_response(conn, row["id"]) for row in rows]

    def create_supplier_order(self, payload: dict[str, Any]) -> dict[str, Any]:
        supplier_id = parse_positive_int(get_value(payload, "supplierId", "supplier_id"), "Supplier")
        order_date = parse_date(get_value(payload, "orderDate", "order_date", default=""), "Order date", default_today=True)
        expected_date = parse_date(get_value(payload, "expectedDeliveryDate", "expected_delivery_date"), "Expected delivery date")
        status = str(get_value(payload, "status", default="sent")).strip() or "sent"
        if status not in SUPPLIER_ORDER_STATUSES:
            raise ValidationError("Invalid supplier order status.", errors=["Invalid supplier order status."])
        order_discount = parse_money(get_value(payload, "discountAmount", "discount_amount", default=0), "Order discount", default=Decimal("0"))
        notes = str(get_value(payload, "notes", default="")).strip()
        lines = payload.get("items") or payload.get("lines")
        if not isinstance(lines, list) or not lines:
            raise ValidationError("At least one supplier order item is required.", errors=["At least one supplier order item is required."])

        with self.connect() as conn:
            supplier = conn.execute("SELECT * FROM suppliers WHERE id = ? AND is_active = 1", (supplier_id,)).fetchone()
            if supplier is None:
                raise ValidationError("Supplier was not found.", code="NOT_FOUND", status=404, errors=["Supplier was not found."])
            parsed_lines: list[dict[str, Any]] = []
            seen: set[int] = set()
            for index, line in enumerate(lines, start=1):
                medicine_id = parse_positive_int(get_value(line, "medicineId", "medicine_id"), f"Line {index} medicine")
                if medicine_id in seen:
                    raise ValidationError("Duplicate supplier order medicines are not allowed.", errors=[f"Line {index}: duplicate medicine."])
                seen.add(medicine_id)
                medicine = self.get_medicine(conn, medicine_id, active_only=True)
                qty = parse_positive_int(get_value(line, "qtyOrdered", "qty_ordered", "quantity"), f"Line {index} quantity")
                unit_price = parse_money(get_value(line, "committedUnitPrice", "committed_unit_price", "unitPrice"), f"Line {index} committed unit price")
                line_discount = parse_money(get_value(line, "discountAmount", "discount_amount", default=0), f"Line {index} discount", default=Decimal("0"))
                line_total = (unit_price * qty) - line_discount
                if line_total < 0:
                    raise ValidationError("Line discount cannot exceed supplier line value.", errors=[f"Line {index}: discount exceeds line value."])
                parsed_lines.append(
                    {
                        "medicine": medicine,
                        "qty": qty,
                        "unit_price": unit_price,
                        "discount": line_discount,
                        "line_total": line_total,
                    }
                )

            total = sum((line["line_total"] for line in parsed_lines), Decimal("0")) - order_discount
            if total < 0:
                raise ValidationError("Order discount cannot exceed committed value.", errors=["Order discount cannot exceed committed value."])

            po_no = self._next_number(conn, "supplier_orders", "po_no", "PO")
            cursor = conn.execute(
                """
                INSERT INTO supplier_orders (
                    po_no, supplier_id, order_date, expected_delivery_date, status, discount_amount,
                    reliability_snapshot, follow_up_phone, notes, total_committed_value
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    po_no,
                    supplier_id,
                    order_date,
                    expected_date,
                    status,
                    money_text(order_discount),
                    supplier["reliability_rating"],
                    str(get_value(payload, "followUpPhone", "follow_up_phone", default=supplier["phone"])).strip(),
                    notes,
                    money_text(total),
                ),
            )
            supplier_order_id = cursor.lastrowid
            for line in parsed_lines:
                conn.execute(
                    """
                    INSERT INTO supplier_order_items (
                        supplier_order_id, medicine_id, qty_ordered, qty_received,
                        committed_unit_price, discount_amount, line_total
                    ) VALUES (?, ?, ?, 0, ?, ?, ?)
                    """,
                    (
                        supplier_order_id,
                        line["medicine"]["id"],
                        line["qty"],
                        money_text(line["unit_price"]),
                        money_text(line["discount"]),
                        money_text(line["line_total"]),
                    ),
                )
            return self._supplier_order_response(conn, supplier_order_id)

    def update_supplier_order_status(self, supplier_order_id: int, status: str) -> dict[str, Any]:
        status = str(status or "").strip()
        if status not in SUPPLIER_ORDER_STATUSES:
            raise ValidationError("Invalid supplier order status.", errors=["Invalid supplier order status."])
        with self.connect() as conn:
            self._supplier_order_response(conn, supplier_order_id)
            conn.execute("UPDATE supplier_orders SET status = ?, updated_at = ? WHERE id = ?", (status, now_text(), supplier_order_id))
            return self._supplier_order_response(conn, supplier_order_id)

    def receive_supplier_order(self, supplier_order_id: int, payload: dict[str, Any]) -> dict[str, Any]:
        with self.connect() as conn:
            order = conn.execute("SELECT * FROM supplier_orders WHERE id = ?", (supplier_order_id,)).fetchone()
            if order is None:
                raise ValidationError("Supplier order was not found.", code="NOT_FOUND", status=404, errors=["Supplier order was not found."])
            if order["status"] in {"cancelled", "received"}:
                raise ValidationError("Supplier order cannot receive stock in its current status.", errors=["Supplier order cannot receive stock in its current status."])

            current_items = conn.execute("SELECT * FROM supplier_order_items WHERE supplier_order_id = ?", (supplier_order_id,)).fetchall()
            requested = payload.get("items")
            if requested:
                receive_map = {
                    parse_positive_int(get_value(item, "itemId", "id"), "Supplier order item"): parse_positive_int(
                        get_value(item, "qtyReceived", "qty_received", "quantity"),
                        "Received quantity",
                    )
                    for item in requested
                }
            else:
                receive_map = {item["id"]: int(item["qty_ordered"]) - int(item["qty_received"]) for item in current_items}

            for item in current_items:
                qty_to_receive = receive_map.get(item["id"], 0)
                if qty_to_receive <= 0:
                    continue
                remaining = int(item["qty_ordered"]) - int(item["qty_received"])
                if qty_to_receive > remaining:
                    raise ValidationError("Received quantity exceeds remaining quantity.", errors=[f"Item {item['id']}: received quantity exceeds remaining quantity."])
                conn.execute(
                    "UPDATE supplier_order_items SET qty_received = qty_received + ? WHERE id = ?",
                    (qty_to_receive, item["id"]),
                )
                conn.execute(
                    "UPDATE inventory SET current_units = current_units + ?, updated_at = ? WHERE medicine_id = ?",
                    (qty_to_receive, now_text(), item["medicine_id"]),
                )
                conn.execute(
                    """
                    INSERT INTO stock_movements (medicine_id, movement_type, qty_delta, source_type, source_id, unit_value, note)
                    VALUES (?, 'SUPPLIER_RECEIPT', ?, 'supplier_order', ?, ?, ?)
                    """,
                    (item["medicine_id"], qty_to_receive, supplier_order_id, money_text(item["committed_unit_price"]), order["po_no"]),
                )

            totals = conn.execute(
                """
                SELECT SUM(qty_ordered) AS ordered, SUM(qty_received) AS received
                FROM supplier_order_items WHERE supplier_order_id = ?
                """,
                (supplier_order_id,),
            ).fetchone()
            new_status = "received" if int(totals["received"] or 0) >= int(totals["ordered"] or 0) else "partially received"
            conn.execute("UPDATE supplier_orders SET status = ?, updated_at = ? WHERE id = ?", (new_status, now_text(), supplier_order_id))
            return self._supplier_order_response(conn, supplier_order_id)

    def home_summary(self, *, page: int = 1, page_size: int = 10) -> dict[str, Any]:
        page = max(1, page)
        page_size = max(1, min(50, page_size))
        offset = (page - 1) * page_size
        today = today_iso()
        ytd_start = f"{today[:4]}-01-01"

        with self.connect() as conn:
            today_sales = conn.execute(
                "SELECT COALESCE(SUM(total_amount), 0) AS value FROM sales_orders WHERE status = 'completed' AND order_date = ?",
                (today,),
            ).fetchone()["value"]
            ytd_sales = conn.execute(
                "SELECT COALESCE(SUM(total_amount), 0) AS value FROM sales_orders WHERE status = 'completed' AND order_date BETWEEN ? AND ?",
                (ytd_start, today),
            ).fetchone()["value"]
            today_qty = conn.execute(
                """
                SELECT COALESCE(SUM(soi.qty_sold), 0) AS qty
                FROM sales_order_items soi JOIN sales_orders so ON so.id = soi.sales_order_id
                WHERE so.status = 'completed' AND so.order_date = ?
                """,
                (today,),
            ).fetchone()["qty"]
            ytd_qty = conn.execute(
                """
                SELECT COALESCE(SUM(soi.qty_sold), 0) AS qty
                FROM sales_order_items soi JOIN sales_orders so ON so.id = soi.sales_order_id
                WHERE so.status = 'completed' AND so.order_date BETWEEN ? AND ?
                """,
                (ytd_start, today),
            ).fetchone()["qty"]
            inventory_rows = [
                self._inventory_response(row)
                for row in conn.execute(
                    """
                    SELECT i.*, m.sku_code, m.sku_name, m.medicine_name, m.brand, m.is_active
                    FROM inventory i JOIN medicines m ON m.id = i.medicine_id
                    WHERE m.is_active = 1
                    ORDER BY i.current_units ASC, m.medicine_name
                    """
                ).fetchall()
            ]
            # low_stock = [row for row in inventory_rows if row["status"] == "LOW_STOCK"]
            # refill_soon = [row for row in inventory_rows if row["status"] == "REFILL_SOON"]

            pending_total = conn.execute(
                "SELECT COUNT(*) AS count FROM supplier_orders WHERE status IN ('sent', 'awaiting confirmation')"
            ).fetchone()["count"]
            pending_ids = conn.execute(
                """
                SELECT id FROM supplier_orders
                WHERE status IN ('sent', 'awaiting confirmation')
                ORDER BY expected_delivery_date ASC, id DESC
                LIMIT ? OFFSET ?
                """,
                (page_size, offset),
            ).fetchall()
            pending_orders = [self._supplier_order_response(conn, row["id"]) for row in pending_ids]

            overdue_ids = conn.execute(
                """
                SELECT id FROM supplier_orders
                WHERE expected_delivery_date < ? AND status NOT IN ('received', 'cancelled')
                ORDER BY expected_delivery_date ASC
                """,
                (today,),
            ).fetchall()

        alerts: list[dict[str, Any]] = []
        # for item in low_stock:
        #     alerts.append(
        #         {
        #             "alertKey": f"LOW_STOCK:{item['medicineId']}",
        #             "alertType": "LOW_STOCK",
        #             "severity": "critical",
        #             "entityType": "medicine",
        #             "entityId": item["medicineId"],
        #             "message": f"{item['skuName']} is at or below replenishment level.",
        #         }
        #     )
        # for item in refill_soon:
        #     alerts.append(
        #         {
        #             "alertKey": f"REFILL_SOON:{item['medicineId']}",
        #             "alertType": "REFILL_SOON",
        #             "severity": "warning",
        #             "entityType": "medicine",
        #             "entityId": item["medicineId"],
        #             "message": f"{item['skuName']} should be refilled soon.",
        #         }
        #     )
        for order in pending_orders:
            alerts.append(
                {
                    "alertKey": f"SUPPLIER_CONFIRMATION_PENDING:{order['id']}",
                    "alertType": "SUPPLIER_CONFIRMATION_PENDING",
                    "severity": "warning",
                    "entityType": "supplier_order",
                    "entityId": order["id"],
                    "message": f"{order['poNo']} needs supplier confirmation. Follow up: {order['followUpPhone'] or order['supplierPhone']}",
                }
            )
        with self.connect() as conn:
            for row in overdue_ids:
                order = self._supplier_order_response(conn, row["id"])
                alerts.append(
                    {
                        "alertKey": f"SUPPLIER_OVERDUE:{order['id']}",
                        "alertType": "SUPPLIER_OVERDUE",
                        "severity": "critical",
                        "entityType": "supplier_order",
                        "entityId": order["id"],
                        "message": f"{order['poNo']} is overdue. Follow up: {order['followUpPhone'] or order['supplierPhone']}",
                    }
                )

        return {
            "date": today,
            "todaySalesValue": money_text(today_sales),
            "ytdSalesValue": money_text(ytd_sales),
            "todayQtySold": int(today_qty or 0),
            "ytdQtySold": int(ytd_qty or 0),
            # "lowStockMedicines": low_stock,
            # "refillSoonMedicines": refill_soon,
            "pendingSupplierOrders": pending_orders,
            "pendingSupplierOrdersPage": page,
            "pendingSupplierOrdersPageSize": page_size,
            "pendingSupplierOrdersTotal": int(pending_total or 0),
            "alerts": alerts,
        }

    def _receipt_lines(self, conn: sqlite3.Connection, sales_order_id: int) -> tuple[str, list[str]]:
        order = self._sale_order_response(conn, sales_order_id)
        lines = [
            "MEDTRACK CUSTOMER RECEIPT",
            f"Receipt: {order['orderNo']}",
            f"Date: {order['orderDate']}",
            f"Customer: {order['customerName'] or '-'}",
            f"Phone: {order['customerPhone'] or '-'}",
            "",
            "Items",
        ]
        for item in order["items"]:
            lines.append(
                f"{item['skuCode']} {item['medicineName']} | Qty {item['qtySold']} | Unit Rs {item['unitPrice']} | Disc Rs {item['discountAmount']} | Total Rs {item['lineTotal']}"
            )
        lines.extend(["", f"Subtotal: Rs {order['subtotal']}", f"Order Discount: Rs {order['discountAmount']}", f"Grand Total: Rs {order['totalAmount']}"])
        return f"{order['orderNo']}_receipt.pdf", lines

    def _supplier_invoice_lines(self, conn: sqlite3.Connection, supplier_order_id: int) -> tuple[str, list[str]]:
        order = self._supplier_order_response(conn, supplier_order_id)
        lines = [
            "MEDTRACK SUPPLIER ORDER INVOICE",
            f"PO: {order['poNo']}",
            f"Supplier: {order['supplierName']}",
            f"Phone: {order['followUpPhone'] or order['supplierPhone'] or '-'}",
            f"Order Date: {order['orderDate']}",
            f"Deadline: {order['expectedDeliveryDate']}",
            f"Status: {order['status']}",
            f"Reliability: {order['reliabilitySnapshot']}/5",
            "",
            "Items",
        ]
        for item in order["items"]:
            lines.append(
                f"{item['skuCode']} {item['medicineName']} | Ordered {item['qtyOrdered']} | Received {item['qtyReceived']} | Unit Rs {item['committedUnitPrice']} | Disc Rs {item['discountAmount']} | Total Rs {item['lineTotal']}"
            )
        lines.extend(["", f"Order Discount: Rs {order['discountAmount']}", f"Committed Value: Rs {order['totalCommittedValue']}", f"Notes: {order['notes'] or '-'}"])
        return f"{order['poNo']}_supplier_invoice.pdf", lines

    def sales_receipt_pdf(self, sales_order_id: int) -> tuple[str, bytes]:
        with self.connect() as conn:
            filename, lines = self._receipt_lines(conn, sales_order_id)
            pdf = build_pdf(lines)
            path = self.documents_dir / filename
            path.write_bytes(pdf)
            conn.execute(
                "INSERT INTO documents (document_type, source_type, source_id, file_path) VALUES ('receipt_pdf', 'sales_order', ?, ?)",
                (sales_order_id, str(path)),
            )
        return filename, pdf

    def supplier_invoice_pdf(self, supplier_order_id: int) -> tuple[str, bytes]:
        with self.connect() as conn:
            filename, lines = self._supplier_invoice_lines(conn, supplier_order_id)
            pdf = build_pdf(lines)
            path = self.documents_dir / filename
            path.write_bytes(pdf)
            conn.execute(
                "INSERT INTO documents (document_type, source_type, source_id, file_path) VALUES ('supplier_invoice_pdf', 'supplier_order', ?, ?)",
                (supplier_order_id, str(path)),
            )
        return filename, pdf


def pdf_escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def build_pdf(lines: list[str]) -> bytes:
    rendered: list[str] = []
    for line in lines:
        if not line:
            rendered.append("")
            continue
        wrapped = wrap(line, width=92) or [line]
        rendered.extend(wrapped)

    content_lines = ["BT", "/F1 10 Tf", "50 790 Td", "14 TL"]
    for index, line in enumerate(rendered[:52]):
        if index:
            content_lines.append("T*")
        content_lines.append(f"({pdf_escape(line)}) Tj")
    content_lines.append("ET")
    stream = "\n".join(content_lines).encode("latin-1", errors="replace")

    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>",
        b"<< /Length " + str(len(stream)).encode("ascii") + b" >>\nstream\n" + stream + b"\nendstream",
    ]

    output = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for index, obj in enumerate(objects, start=1):
        offsets.append(len(output))
        output.extend(f"{index} 0 obj\n".encode("ascii"))
        output.extend(obj)
        output.extend(b"\nendobj\n")
    xref_at = len(output)
    output.extend(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
    output.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        output.extend(f"{offset:010d} 00000 n \n".encode("ascii"))
    output.extend(f"trailer << /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_at}\n%%EOF\n".encode("ascii"))
    return bytes(output)
