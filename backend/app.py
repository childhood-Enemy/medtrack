from __future__ import annotations

from flask import Flask, Response, jsonify, request
from werkzeug.exceptions import HTTPException

from sqlite_store import SQLiteStore, ValidationError
from reportlab.platypus import (
    SimpleDocTemplate,
    Table,
    TableStyle,
    Paragraph
)


app = Flask(__name__)
store = SQLiteStore()


@app.after_request
def add_cors_headers(response: Response) -> Response:
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET,POST,PUT,PATCH,DELETE,OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return response


@app.route("/api/<path:_path>", methods=["OPTIONS"])
def options_handler(_path: str) -> Response:
    return Response(status=204)


@app.errorhandler(ValidationError)
def handle_validation_error(error: ValidationError):
    return jsonify(error.to_payload()), error.status


@app.errorhandler(HTTPException)
def handle_http_error(error: HTTPException):
    return jsonify({"ok": False, "code": "HTTP_ERROR", "message": error.description}), error.code


@app.errorhandler(Exception)
def handle_unexpected_error(error: Exception):
    app.logger.exception("Unhandled API error")
    return jsonify({"ok": False, "code": "SERVER_ERROR", "message": "Unexpected server error."}), 500


def request_json() -> dict:
    return request.get_json(silent=True) or {}


def int_query(name: str, default: int, *, minimum: int = 1, maximum: int = 200) -> int:
    try:
        return max(minimum, min(maximum, int(request.args.get(name, default))))
    except (TypeError, ValueError):
        return default


@app.get("/api/health")
def health():
    return jsonify(store.health())


@app.get("/api/home/summary")
def home_summary():
    return jsonify(
        store.home_summary(
            page=int_query("page", 1, maximum=10_000),
            page_size=int_query("pageSize", 10, maximum=50),
        )
    )


@app.get("/api/summary")
def legacy_summary():
    return jsonify(store.home_summary())


@app.get("/api/medicines")
def medicines_index():
    include_archived = request.args.get("includeArchived", "").lower() in {"1", "true", "yes"}
    return jsonify(store.list_medicines(include_archived=include_archived))


@app.post("/api/medicines")
def medicines_create():
    return jsonify(store.create_medicine(request_json())), 201


@app.put("/api/medicines/<int:medicine_id>")
def medicines_update(medicine_id: int):
    return jsonify(store.update_medicine(medicine_id, request_json()))


@app.delete("/api/medicines/<int:medicine_id>")
def medicines_delete(medicine_id: int):
    return jsonify(store.archive_medicine(medicine_id))


@app.get("/api/inventory")
def inventory_index():
    return jsonify(store.list_inventory())


@app.post("/api/inventory/<int:medicine_id>/correction")
def inventory_correction(medicine_id: int):
    return jsonify(store.correct_inventory(medicine_id, request_json()))


@app.get("/api/suppliers")
def suppliers_index():
    include_archived = request.args.get("includeArchived", "").lower() in {"1", "true", "yes"}
    return jsonify(store.list_suppliers(include_archived=include_archived))


@app.post("/api/suppliers")
def suppliers_create():
    return jsonify(store.create_supplier(request_json())), 201


@app.put("/api/suppliers/<int:supplier_id>")
def suppliers_update(supplier_id: int):
    return jsonify(store.update_supplier(supplier_id, request_json()))


@app.delete("/api/suppliers/<int:supplier_id>")
def suppliers_delete(supplier_id: int):
    return jsonify(store.archive_supplier(supplier_id))


@app.get("/api/sales-orders")
def sales_orders_index():
    return jsonify(store.list_sales_orders(limit=int_query("limit", 50, maximum=200)))


@app.post("/api/sales-orders")
def sales_orders_create():
    return jsonify(store.create_sales_order(request_json())), 201


@app.get("/api/sales-orders/<int:sales_order_id>/receipt.pdf")
def sales_order_receipt(sales_order_id: int):
    # filename, pdf = store.sales_receipt_pdf(sales_order_id)
    filename, pdf = store.sales_receipt_pdf_v2(sales_order_id)
    return Response(
        pdf,
        mimetype="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@app.get("/api/supplier-orders")
def supplier_orders_index():
    return jsonify(store.list_supplier_orders(limit=int_query("limit", 100, maximum=200)))


@app.post("/api/supplier-orders")
def supplier_orders_create():
    return jsonify(store.create_supplier_order(request_json())), 201


@app.patch("/api/supplier-orders/<int:supplier_order_id>/status")
def supplier_orders_status(supplier_order_id: int):
    payload = request_json()
    return jsonify(store.update_supplier_order_status(supplier_order_id, payload.get("status", "")))


@app.post("/api/supplier-orders/<int:supplier_order_id>/receive")
def supplier_orders_receive(supplier_order_id: int):
    return jsonify(store.receive_supplier_order(supplier_order_id, request_json()))


@app.get("/api/supplier-orders/<int:supplier_order_id>/invoice.pdf")
def supplier_order_invoice(supplier_order_id: int):
    # filename, pdf = store.supplier_invoice_pdf(supplier_order_id)
    filename, pdf = store.supplier_invoice_pdf_v2(supplier_order_id)
    return Response(
        pdf,
        mimetype="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
